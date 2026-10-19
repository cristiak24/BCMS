import { validateInvitationToken } from '../services/invitationsService';
import { looksLikeInviteCode, findUsableInviteCode } from './clubInviteCodes';
import { looksLikeTeamCode } from './familyJoin';
import { findTeamByJoinCode } from './familyJoinService';
import { findUsableGuardianInvite, looksLikeGuardianInvite } from './guardianInvites';
import { validateInviteToken } from './manageAccessService';

/**
 * One place that answers "what is this token, and can it still be used?" for
 * every way into a club. The signup form (validate) and the signup itself
 * (complete) both go through here, so the two can never disagree on what a
 * token is or what to tell the person when it fails.
 *
 * Order matters: the short shapes (guardian `fam_…`, team code 6, club code 8)
 * are tried first; anything else is a classic email invitation, then a
 * manage-access link (64 hex).
 */

export const INVITE_ERRORS = {
    guardian: 'Invitația a expirat sau a fost folosită. Cere una nouă clubului.',
    guardianUsed: 'Invitația a fost deja folosită. Cere una nouă clubului.',
    team: 'Codul echipei nu este valid. Cere-l antrenorului.',
    code: 'Codul de invitație nu este valid, a expirat sau a atins numărul maxim de utilizări.',
    teamGone: 'Echipa din acest cod nu mai există. Cere un cod nou administratorului clubului.',
    teamClosed: 'Înscrierile cu acest cod sunt oprite momentan. Cere-i antrenorului sau clubului să le redeschidă.',
} as const;

type Guardian = NonNullable<Awaited<ReturnType<typeof findUsableGuardianInvite>>>;
type TeamHit = NonNullable<Awaited<ReturnType<typeof findTeamByJoinCode>>>;
type ClubCode = NonNullable<Awaited<ReturnType<typeof findUsableInviteCode>>>;
type Classic = NonNullable<Awaited<ReturnType<typeof validateInvitationToken>>>;
type AccessLink = Awaited<ReturnType<typeof validateInviteToken>>;

export type ResolvedInvite =
    | { kind: 'guardian'; invite: Guardian }
    | { kind: 'team'; hit: TeamHit }
    | { kind: 'club-code'; code: ClubCode }
    | { kind: 'invitation'; invitation: Classic }
    | { kind: 'access-link'; link: AccessLink };

export type InviteLookup = { ok: true; invite: ResolvedInvite } | { ok: false; error: string };

export async function resolveInvite(raw: string): Promise<InviteLookup> {
    if (looksLikeGuardianInvite(raw)) {
        const invite = await findUsableGuardianInvite(raw);
        return invite ? { ok: true, invite: { kind: 'guardian', invite } } : { ok: false, error: INVITE_ERRORS.guardian };
    }

    if (looksLikeTeamCode(raw)) {
        const hit = await findTeamByJoinCode(raw);
        if (!hit) return { ok: false, error: INVITE_ERRORS.team };
        if (!hit.team.joinCodeEnabled) return { ok: false, error: INVITE_ERRORS.teamClosed };
        return { ok: true, invite: { kind: 'team', hit } };
    }

    if (looksLikeInviteCode(raw)) {
        const code = await findUsableInviteCode(raw);
        return code ? { ok: true, invite: { kind: 'club-code', code } } : { ok: false, error: INVITE_ERRORS.code };
    }

    const invitation = await validateInvitationToken(raw);
    if (invitation) return { ok: true, invite: { kind: 'invitation', invitation } };

    try {
        return { ok: true, invite: { kind: 'access-link', link: await validateInviteToken(raw) } };
    } catch (error) {
        return { ok: false, error: error instanceof Error ? error.message : 'Invite not found or already used/expired' };
    }
}

/**
 * What the signup form shows about a token, or null when it cannot be used
 * (an email invitation that expired or was already spent).
 */
export function describeInvite(invite: ResolvedInvite) {
    const open = { email: null, status: 'pending', canAccept: true, message: null };
    switch (invite.kind) {
        case 'guardian':
            return {
                ...open,
                source: 'guardian',
                clubId: invite.invite.clubId,
                clubName: invite.invite.clubName,
                childName: invite.invite.childName,
                role: 'parent',
            };
        case 'team':
            return {
                ...open,
                source: 'team',
                clubId: invite.hit.team.clubId,
                clubName: invite.hit.clubName,
                teamId: invite.hit.team.id,
                teamName: invite.hit.team.name,
                role: null,
            };
        case 'club-code':
            return {
                ...open,
                source: 'code',
                clubId: invite.code.clubId,
                clubName: invite.code.clubName,
                role: invite.code.role,
                teamId: invite.code.teamName ? invite.code.teamId : null,
                teamName: invite.code.teamName,
                expiresAt: invite.code.expiresAt,
            };
        case 'invitation':
            if (invite.invitation.isExpired || invite.invitation.status !== 'pending') return null;
            return { source: 'invitation', ...invite.invitation };
        case 'access-link':
            return { ...open, source: 'manage-access', ...invite.link };
    }
}
