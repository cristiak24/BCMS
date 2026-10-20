import { eq } from 'drizzle-orm';
import { db } from '../db';
import { users } from '../db/schema';
import { acceptInvitation, COACH_PHONE_REQUIRED } from '../services/invitationsService';
import { writeAuditLog, type AuditLogInput } from '../services/auditService';
import { notifyReviewers } from './accessNotify';
import { registerWithAccessLink, registerWithGuardianInvite, registerWithTeamCode } from './accountSignup';
import { consumeInviteCode, findClubTeam, releaseInviteCodeUse } from './clubInviteCodes';
import { registerWithClubCode } from './clubCodeSignup';
import { normalizePhone } from './contacts';
import { parseParentChildren, parseTeamSignup } from './familyJoin';
import { INVITE_ERRORS, resolveInvite, type ResolvedInvite } from './inviteResolver';
import { splitDisplayName } from './password';

/**
 * Signing up through any invite: the token is resolved once (inviteResolver),
 * then the matching branch creates the account. Every branch answers with an
 * HTTP-shaped result so the route stays a thin wrapper; anything unexpected
 * is thrown and becomes a 400 with its message.
 */

export type InviteSignupInput = {
    body: Record<string, unknown> | undefined;
    identity: { uid: string; email: string };
    /** The caller's existing account row, if any. */
    existingUser: { id: number; status: string } | null;
    ip: string | null;
    userAgent: string | null;
};

export type InviteSignupResult = { status: number; body: Record<string, unknown> };

const ACTIVE_ACCOUNT_ERROR = 'Există deja un cont activ cu acest email. Autentifică-te.';
const PHONE_REQUIRED = 'Numărul de telefon este obligatoriu.';

const fail = (status: number, error: string): InviteSignupResult => ({ status, body: { error } });
const created = (user: Record<string, unknown>): InviteSignupResult => ({ status: 201, body: { success: true, user } });

type Ctx = {
    body: Record<string, unknown>;
    token: string;
    name: string;
    firstName: string;
    lastName: string;
    phone: string | null;
    uid: string;
    email: string;
    existingUserId: number | null;
    isActive: boolean;
    audit: (entry: Omit<AuditLogInput, 'actorUid' | 'ipAddress' | 'userAgent'>) => Promise<void>;
};

type Of<K extends ResolvedInvite['kind']> = Extract<ResolvedInvite, { kind: K }>;

// Parent codes and links carry the children typed on the form (name + birth
// year); a team code carries its own shape and is parsed by parseTeamSignup.
function parentChildren(ctx: Ctx, role: string) {
    if (role !== 'parent') return { ok: true as const, value: null };
    const parsed = parseParentChildren(ctx.body);
    if (!parsed.ok) return parsed;
    if (parsed.value && !ctx.phone) return { ok: false as const, error: PHONE_REQUIRED };
    return parsed;
}

export async function completeInviteSignup(input: InviteSignupInput): Promise<InviteSignupResult> {
    const body = input.body ?? {};
    const { name, inviteToken } = body as { name?: string; inviteToken?: unknown };
    if (!name || !inviteToken) return fail(400, 'Name and invite token are required');

    // Phone is collected on every signup form. Required for a coach (checked
    // per branch below) and a parent registering children; otherwise optional.
    const phoneCheck = normalizePhone(body.phone, 'Telefon');
    if (!phoneCheck.ok) return fail(400, phoneCheck.error);

    const token = String(inviteToken);
    const found = await resolveInvite(token);
    if (!found.ok) return fail(400, found.error);

    const { firstName, lastName } = splitDisplayName(name);
    const ctx: Ctx = {
        body,
        token,
        name,
        firstName,
        lastName,
        phone: phoneCheck.value,
        uid: input.identity.uid,
        email: input.identity.email,
        existingUserId: input.existingUser?.id ?? null,
        isActive: input.existingUser?.status === 'active',
        audit: (entry) => writeAuditLog({ ...entry, actorUid: input.identity.uid, ipAddress: input.ip, userAgent: input.userAgent }),
    };

    const invite = found.invite;
    switch (invite.kind) {
        case 'guardian': return signUpWithGuardianInvite(ctx, invite);
        case 'team': return signUpWithTeamCode(ctx, invite);
        case 'club-code': return signUpWithClubCode(ctx, invite);
        case 'invitation': return signUpWithEmailInvitation(ctx);
        case 'access-link': return signUpWithAccessLink(ctx, invite);
    }
}

// Personal parent invite: the club already chose the child, so the account is
// active and linked right away.
async function signUpWithGuardianInvite(ctx: Ctx, { invite }: Of<'guardian'>) {
    if (!ctx.phone) return fail(400, PHONE_REQUIRED);
    if (ctx.isActive) {
        return fail(409, 'Există deja un cont activ cu acest email. Autentifică-te și deschide din nou linkul.');
    }
    const signedUp = await registerWithGuardianInvite({
        existingUserId: ctx.existingUserId,
        clerkUserId: ctx.uid,
        email: ctx.email,
        name: ctx.name,
        firstName: ctx.firstName,
        lastName: ctx.lastName,
        phone: ctx.phone,
        token: ctx.token,
        clubId: invite.clubId,
    });
    // Lost a race for the last use: nothing of this signup was kept.
    if (!signedUp) return fail(400, INVITE_ERRORS.guardianUsed);

    await ctx.audit({
        action: 'auth.signup_with_guardian_invite',
        entityType: 'player',
        entityId: signedUp.redeemed.playerId,
        actorUserId: signedUp.user.id,
        actorRole: 'parent',
        clubId: invite.clubId,
        metadata: null,
    });
    return created({ userId: signedUp.user.id, clubId: invite.clubId, role: 'parent', status: 'active' });
}

// Team code (6 chars): parents register their children, teenage players
// themselves; the role is picked on the form, approval follows.
async function signUpWithTeamCode(ctx: Ctx, { hit }: Of<'team'>) {
    const parsed = parseTeamSignup(ctx.body);
    if (!parsed.ok) return fail(400, parsed.error);
    // An existing, working account must not be flipped back to pending
    // (and possibly to another role) by a team code.
    if (ctx.isActive) return fail(409, ACTIVE_ACCOUNT_ERROR);

    const { user, requests } = await registerWithTeamCode({
        existingUserId: ctx.existingUserId,
        clerkUserId: ctx.uid,
        email: ctx.email,
        name: ctx.name,
        firstName: ctx.firstName,
        lastName: ctx.lastName,
        signup: parsed.value,
        team: hit.team,
    });
    // A retried signup finds its requests already waiting: the admin heard about them the first time.
    if (requests.length > 0) {
        void notifyReviewers({
            clubId: hit.team.clubId,
            teamId: hit.team.id,
            requesterId: user.id,
            requesterName: ctx.name,
            role: parsed.value.kind,
            teamName: hit.team.name,
            children: parsed.value.kind === 'parent' ? requests.map((request) => `${request.childFirstName} ${request.childLastName}`) : [],
        });
    }
    await ctx.audit({
        action: 'auth.signup_with_team_code',
        entityType: 'team',
        entityId: hit.team.id,
        actorUserId: user.id,
        actorRole: parsed.value.kind,
        clubId: hit.team.clubId,
        metadata: { requests: requests.map((request) => request.id) },
    });
    return created({ userId: user.id, clubId: hit.team.clubId, role: parsed.value.kind, status: 'pending' });
}

// Short club code: the admin already bounded who can use it (expiry + usage
// cap), so the account is active right away with the code's role — except
// coaches, who always wait for an admin to approve them.
async function signUpWithClubCode(ctx: Ctx, { code }: Of<'club-code'>) {
    // A working account must not have its role, club or status rewritten by a
    // code (an admin opening a coach code would lock themselves out).
    if (ctx.isActive) return fail(409, ACTIVE_ACCOUNT_ERROR);
    if (code.role === 'coach' && !ctx.phone) return fail(400, COACH_PHONE_REQUIRED);
    const parsedKids = parentChildren(ctx, code.role);
    if (!parsedKids.ok) return fail(400, parsedKids.error);

    const consumed = await consumeInviteCode(ctx.token);
    if (!consumed) return fail(400, INVITE_ERRORS.code);

    try {
        const kids = consumed.role === 'parent' ? parsedKids.value : null;
        const needsApproval = consumed.role === 'coach';
        let team: { id: number; name: string } | null = null;
        if (kids && consumed.teamId != null) {
            team = await findClubTeam(consumed.clubId, consumed.teamId);
            if (!team) throw new Error(INVITE_ERRORS.teamGone);
        }

        const { user, status, requested, requestCreated } = await registerWithClubCode({
            existingUserId: ctx.existingUserId,
            clerkUserId: ctx.uid,
            email: ctx.email,
            name: ctx.name,
            firstName: ctx.firstName,
            lastName: ctx.lastName,
            phone: ctx.phone,
            code: { role: consumed.role, clubId: consumed.clubId },
            team,
            children: kids,
        });

        if (needsApproval) {
            if (requestCreated) void notifyReviewers({ clubId: consumed.clubId, requesterId: user.id, requesterName: ctx.name, role: 'coach' });
        } else if (requested.length > 0 && team) {
            void notifyReviewers({
                clubId: consumed.clubId,
                teamId: team.id,
                requesterId: user.id,
                requesterName: ctx.name,
                role: 'parent',
                teamName: team.name,
                children: requested.map((request) => `${request.childFirstName} ${request.childLastName}`),
            });
        }

        await ctx.audit({
            action: 'auth.signup_with_invite_code',
            entityType: 'club_invite_code',
            entityId: consumed.id,
            actorUserId: user.id,
            actorRole: consumed.role,
            clubId: consumed.clubId,
            metadata: kids ? { children: kids.length, teamId: team?.id ?? null, awaitingLink: requested.length } : needsApproval ? { pendingApproval: true } : null,
        });
        return created({ userId: user.id, clubId: consumed.clubId, role: consumed.role, status });
    } catch (error) {
        await releaseInviteCodeUse(consumed.id).catch(() => undefined);
        throw error;
    }
}

// Classic email invitation: bound to one address, the account comes in with
// the role the super admin chose.
async function signUpWithEmailInvitation(ctx: Ctx) {
    const result = await acceptInvitation({
        token: ctx.token,
        clerkUserId: ctx.uid,
        email: ctx.email,
        firstName: ctx.firstName,
        lastName: ctx.lastName,
        // Checked there: a coach invitation needs it (COACH_PHONE_REQUIRED).
        phone: ctx.phone,
    });
    if (ctx.phone) {
        await db.update(users).set({ phone: ctx.phone }).where(eq(users.clerkUserId, ctx.uid));
    }
    return created(result as Record<string, unknown>);
}

// Manage-access link (64 hex): everyone waits for an admin; a parent's
// children, or a player themselves, wait with the team when the link is tied
// to one (so approval can land them on that team's roster in one step).
async function signUpWithAccessLink(ctx: Ctx, { link }: Of<'access-link'>) {
    if (ctx.isActive) return fail(409, ACTIVE_ACCOUNT_ERROR);
    if (link.role === 'coach' && !ctx.phone) return fail(400, COACH_PHONE_REQUIRED);
    const parsedKids = parentChildren(ctx, link.role);
    if (!parsedKids.ok) return fail(400, parsedKids.error);

    const kids = parsedKids.value;
    const wantsTeam = (kids || link.role === 'player') && link.teamId != null;
    const linkTeam = wantsTeam ? await findClubTeam(link.clubId, link.teamId as number) : null;
    if (wantsTeam && !linkTeam) return fail(400, INVITE_ERRORS.teamGone);

    const { user, queuedForTeam, requestCreated } = await registerWithAccessLink({
        existingUserId: ctx.existingUserId,
        clerkUserId: ctx.uid,
        email: ctx.email,
        name: ctx.name,
        firstName: ctx.firstName,
        lastName: ctx.lastName,
        phone: ctx.phone,
        link: { role: link.role, clubId: link.clubId },
        team: linkTeam,
        children: kids,
    });

    if (kids && linkTeam && queuedForTeam) {
        void notifyReviewers({
            clubId: link.clubId,
            teamId: linkTeam.id,
            requesterId: user.id,
            requesterName: ctx.name,
            role: 'parent',
            teamName: linkTeam.name,
            children: kids.map((child) => `${child.firstName} ${child.lastName}`),
        });
    } else if (requestCreated) {
        // Access requests are approved by club admins only (the coach's
        // Cereri page lists family join requests, not access requests), so
        // the team only names where the player will land, without paging
        // its coach.
        void notifyReviewers({
            clubId: link.clubId,
            requesterId: user.id,
            requesterName: ctx.name,
            role: link.role,
            teamName: linkTeam?.name ?? null,
        });
    }
    return created({ userId: user.id, clubId: link.clubId, role: link.role, status: 'pending' });
}
