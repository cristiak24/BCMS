import { Router } from 'express';
import { db } from '../db';
import { users, clubs, teams } from '../db/schema';
import { eq } from 'drizzle-orm';
import { splitDisplayName } from '../lib/password';
import { authenticate, requireSuperadmin, AuthenticatedRequest } from '../middleware/auth';
import { acceptInvitation, createSuperAdminInvitation, validateInvitationToken } from '../services/invitationsService';
import { createPendingAccessRequestForSignup, validateInviteToken } from '../lib/manageAccessService';
import { loadServerEnv } from '../lib/loadEnv';
import { consumeInviteCode, findClubTeam, findUsableInviteCode, looksLikeInviteCode, releaseInviteCodeUse } from '../lib/clubInviteCodes';
import { clientIp, rateLimit } from '../middleware/rateLimit';
import { writeAuditLog } from '../services/auditService';
import { looksLikeTeamCode, parseParentChildren, parseTeamSignup } from '../lib/familyJoin';
import { loadOwnRequests, notifyReviewers } from '../lib/accessNotify';
import { createChildrenForParent, createJoinRequests, findTeamByJoinCode, placeChildrenForParent } from '../lib/familyJoinService';
import { normalizePhone } from '../lib/contacts';
import { resolveSelfPlayerForRequest, teamIdsOfPlayers } from '../lib/selfPlayer';
import { findUsableGuardianInvite, looksLikeGuardianInvite, redeemGuardianInvite } from '../lib/guardianInvites';

const router = Router();
loadServerEnv();

// Public, unauthenticated: throttles guessing short invite codes. Per client IP
// (see clientIp), so a whole team signing up from one gym wifi needs headroom.
const inviteValidateLimiter = rateLimit({ bucket: 'auth:invite-validate', limit: 30, windowMs: 60_000 });
// Signup redeems codes too: cap per Clerk identity and, more loosely, per IP.
const signupIpLimiter = rateLimit({ bucket: 'auth:signup-ip', limit: 60, windowMs: 60_000, key: (req) => `ip:${clientIp(req)}` });
const signupUidLimiter = rateLimit({
    bucket: 'auth:signup',
    limit: 10,
    windowMs: 60_000,
    key: (req) => (req.firebaseUser?.uid ? `uid:${req.firebaseUser.uid}` : null),
});

const ACTIVE_ACCOUNT_ERROR = 'Există deja un cont activ cu acest email. Autentifică-te.';

async function findClubName(clubId?: number | null) {
    if (clubId == null) {
        return null;
    }
    const clubRows = await db.select({ name: clubs.name }).from(clubs).where(eq(clubs.id, clubId)).limit(1);
    return clubRows[0]?.name ?? null;
}

/** Teams of the caller's player record — for a parent, their selected child's. */
async function findSelfTeamIds(req: AuthenticatedRequest) {
    const player = await resolveSelfPlayerForRequest(req);
    return player ? (await teamIdsOfPlayers([player.id])).map(String) : [];
}

function buildAuthUser(user: typeof users.$inferSelect, clubName: string | null, teamIds: string[]) {
    return {
        id: user.id,
        uid: user.firebaseUid ?? user.uid ?? '',
        email: user.email,
        name: user.name,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        clubId: user.clubId,
        status: user.status,
        clubName,
        teamIds,
        avatarUrl: user.avatarUrl,
        photoURL: user.avatarUrl,
        phone: user.phone,
        preferredLanguage: user.preferredLanguage,
        createdAt: user.createdAt,
        lastLoginAt: user.lastLoginAt,
    };
}

// GET /api/auth/me
router.get('/me', authenticate, async (req: AuthenticatedRequest, res: any) => {
    try {
        if (!req.user) {
            return res.status(404).json({ error: 'User profile not found' });
        }

        const user = req.user;
        const [clubName, teamIds] = await Promise.all([findClubName(user.clubId), findSelfTeamIds(req)]);

        res.json({
            success: true,
            user: buildAuthUser(user, clubName, teamIds),
        });
    } catch (error) {
        console.error('Error fetching /me:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// GET /api/auth/my-requests
// What the waiting screen shows: the caller's own requests and whether every
// one of them was turned down. Open to pending accounts (they only see theirs).
router.get('/my-requests', authenticate, async (req: AuthenticatedRequest, res: any) => {
    try {
        if (!req.user) {
            return res.status(404).json({ error: 'User profile not found' });
        }
        res.json(await loadOwnRequests(req.user.id));
    } catch (error) {
        console.error('Error fetching /my-requests:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// POST /api/auth/complete-signup
// Public self-signup is closed: the role (and club) must come from an invite
// created by a club admin, so it goes through /complete-invite-signup. This
// route used to let anyone pick "coach" and land active in a default club.
router.post('/complete-signup', authenticate, async (_req: AuthenticatedRequest, res: any) => {
    res.status(403).json({ error: 'Ai nevoie de un cod de invitație de la administratorul clubului pentru a-ți crea cont.' });
});

// POST /api/auth/superadmin/create-admin-invite
router.post('/superadmin/create-admin-invite', authenticate, requireSuperadmin, async (req: AuthenticatedRequest, res: any) => {
    try {
        const result = await createSuperAdminInvitation({
            email: String(req.body?.email ?? ''),
            role: 'admin',
            clubId: Number(req.body?.clubId),
        }, {
            user: req.user,
            firebaseUser: req.firebaseUser,
            ip: req.ip,
            userAgent: req.get('user-agent') ?? undefined,
        });

        res.status(201).json({
            success: true,
            invitation: result,
            message: 'Invite created successfully.'
        });
    } catch (error) {
        console.error('Create invite error:', error);
        const message = error instanceof Error ? error.message : 'Internal server error';
        res.status(400).json({ error: message });
    }
});

// GET /api/auth/invites/validate
router.get('/invites/validate', inviteValidateLimiter as any, async (req: any, res: any) => {
    try {
        const { token } = req.query;
        if (!token) return res.status(400).json({ error: 'Token is required' });

        const rawToken = String(token);

        // Personal parent invite for one child, made from the player's page.
        if (looksLikeGuardianInvite(rawToken)) {
            const invite = await findUsableGuardianInvite(rawToken);
            if (!invite) {
                return res.status(404).json({ error: 'Invitația a expirat sau a fost folosită. Cere una nouă clubului.' });
            }
            return res.json({
                success: true,
                source: 'guardian',
                email: null,
                status: 'pending',
                canAccept: true,
                message: null,
                clubId: invite.clubId,
                clubName: invite.clubName,
                childName: invite.childName,
                role: 'parent',
            });
        }

        // Team join code (6 chars): parents register their children, teenage
        // players themselves; the role is picked on the form, approval follows.
        if (looksLikeTeamCode(rawToken)) {
            const hit = await findTeamByJoinCode(rawToken);
            if (!hit) {
                return res.status(404).json({ error: 'Codul echipei nu este valid. Cere-l antrenorului.' });
            }
            return res.json({
                success: true,
                source: 'team',
                email: null,
                status: 'pending',
                canAccept: true,
                message: null,
                clubId: hit.team.clubId,
                clubName: hit.clubName,
                teamId: hit.team.id,
                teamName: hit.team.name,
                role: null,
            });
        }

        if (looksLikeInviteCode(rawToken)) {
            const code = await findUsableInviteCode(rawToken);
            if (!code) {
                return res.status(404).json({ error: 'Codul de invitație nu este valid, a expirat sau a atins numărul maxim de utilizări.' });
            }
            return res.json({
                success: true,
                source: 'code',
                email: null,
                status: 'pending',
                canAccept: true,
                message: null,
                clubId: code.clubId,
                clubName: code.clubName,
                role: code.role,
                teamId: code.teamName ? code.teamId : null,
                teamName: code.teamName,
                expiresAt: code.expiresAt,
            });
        }

        const invitation = await validateInvitationToken(rawToken);
        if (invitation) {
            if (invitation.isExpired || invitation.status !== 'pending') {
                return res.status(400).json({ error: 'Invite expired' });
            }
            return res.json({ success: true, source: 'invitation', ...invitation });
        }

        try {
            const manageAccessInvite = await validateInviteToken(rawToken);
            return res.json({
                success: true,
                source: 'manage-access',
                email: null,
                status: 'pending',
                canAccept: true,
                message: null,
                ...manageAccessInvite,
            });
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Invite not found or already used/expired';
            return res.status(404).json({ error: message });
        }
    } catch (error) {
        console.error('Validate invite error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// POST /api/auth/complete-invite-signup
router.post('/complete-invite-signup', signupIpLimiter, authenticate, signupUidLimiter, async (req: AuthenticatedRequest, res: any) => {
    try {
        const { name, inviteToken } = req.body;
        const firebaseUser = req.firebaseUser;

        if (!name || !inviteToken) {
            return res.status(400).json({ error: 'Name and invite token are required' });
        }

        const { firstName, lastName } = splitDisplayName(name);
        let result;

        // Phone is collected on every signup form; optional here only so an
        // older client build keeps working until it is redeployed.
        const phoneCheck = normalizePhone(req.body?.phone, 'Telefon');
        if (!phoneCheck.ok) {
            return res.status(400).json({ error: phoneCheck.error });
        }
        const phone = phoneCheck.value;

        // Parent codes/links also carry the children typed on the form.
        const childrenCheck = parseParentChildren(req.body);
        if (!childrenCheck.ok) {
            return res.status(400).json({ error: childrenCheck.error });
        }
        const childrenInput = childrenCheck.value;
        if (childrenInput && !phone) {
            return res.status(400).json({ error: 'Numărul de telefon este obligatoriu.' });
        }

        // Personal parent invite: the club already chose the child, so the
        // account is active and linked right away.
        if (looksLikeGuardianInvite(String(inviteToken))) {
            if (!phone) {
                return res.status(400).json({ error: 'Numărul de telefon este obligatoriu.' });
            }
            const invite = await findUsableGuardianInvite(String(inviteToken));
            if (!invite) {
                return res.status(400).json({ error: 'Invitația a expirat sau a fost folosită. Cere una nouă clubului.' });
            }
            if (req.user && req.user.status === 'active') {
                return res.status(409).json({ error: 'Există deja un cont activ cu acest email. Autentifică-te și deschide din nou linkul.' });
            }
            const values = {
                firebaseUid: firebaseUser.uid,
                email: (firebaseUser.email || '').trim().toLowerCase(),
                name,
                firstName,
                lastName,
                phone,
                role: 'parent' as const,
                status: 'active' as const,
                clubId: invite.clubId,
            };
            const saved = req.user
                ? await db.update(users).set({ ...values, updatedAt: new Date().toISOString() }).where(eq(users.id, req.user.id)).returning()
                : await db.insert(users).values(values).returning();
            const userRecord = saved[0];
            const redeemed = await redeemGuardianInvite(String(inviteToken), userRecord.id);
            if (!redeemed) {
                // Lost a race for the last use: don't leave an active, child-less account behind.
                await db.update(users).set({ status: 'pending' }).where(eq(users.id, userRecord.id));
                return res.status(400).json({ error: 'Invitația a fost deja folosită. Cere una nouă clubului.' });
            }
            await writeAuditLog({
                action: 'auth.signup_with_guardian_invite',
                entityType: 'player',
                entityId: redeemed.playerId,
                actorUserId: userRecord.id,
                actorUid: firebaseUser.uid,
                actorRole: 'parent',
                clubId: invite.clubId,
                metadata: null,
                ipAddress: req.ip ?? null,
                userAgent: req.get('user-agent') ?? null,
            });
            return res.status(201).json({
                success: true,
                user: { userId: userRecord.id, clubId: invite.clubId, role: 'parent', status: 'active' },
            });
        }

        if (looksLikeTeamCode(String(inviteToken))) {
            const parsed = parseTeamSignup(req.body);
            if (!parsed.ok) {
                return res.status(400).json({ error: parsed.error });
            }
            const hit = await findTeamByJoinCode(String(inviteToken));
            if (!hit) {
                return res.status(400).json({ error: 'Codul echipei nu este valid. Cere-l antrenorului.' });
            }
            // An existing, working account must not be flipped back to pending
            // (and possibly to another role) by a team code.
            if (req.user && req.user.status === 'active') {
                return res.status(409).json({ error: 'Există deja un cont activ cu acest email. Autentifică-te.' });
            }

            const values = {
                firebaseUid: firebaseUser.uid,
                email: (firebaseUser.email || '').trim().toLowerCase(),
                name,
                firstName,
                lastName,
                phone: parsed.value.phone,
                role: parsed.value.kind as 'parent' | 'player',
                // In until a club admin or the team's coach approves a request.
                status: 'pending' as const,
                clubId: hit.team.clubId,
            };
            const saved = req.user
                ? await db.update(users).set({ ...values, updatedAt: new Date().toISOString() }).where(eq(users.id, req.user.id)).returning()
                : await db.insert(users).values(values).returning();
            const userRecord = saved[0];
            const requests = await createJoinRequests({ userId: userRecord.id, team: hit.team, input: parsed.value, firstName, lastName });
            void notifyReviewers({
                clubId: hit.team.clubId,
                teamId: hit.team.id,
                requesterId: userRecord.id,
                requesterName: name,
                role: parsed.value.kind,
                teamName: hit.team.name,
                children: parsed.value.kind === 'parent' ? parsed.value.children.map((child) => `${child.firstName} ${child.lastName}`) : [],
            });

            await writeAuditLog({
                action: 'auth.signup_with_team_code',
                entityType: 'team',
                entityId: hit.team.id,
                actorUserId: userRecord.id,
                actorUid: firebaseUser.uid,
                actorRole: parsed.value.kind,
                clubId: hit.team.clubId,
                metadata: { requests: requests.map((r) => r.id) },
                ipAddress: req.ip ?? null,
                userAgent: req.get('user-agent') ?? null,
            });

            return res.status(201).json({
                success: true,
                user: { userId: userRecord.id, clubId: hit.team.clubId, role: parsed.value.kind, status: 'pending' },
            });
        }

        // Short club code: the admin already bounded who can use it (expiry +
        // usage cap), so the account is active right away with the code's role
        // — except coaches, who always wait for an admin to approve them.
        if (looksLikeInviteCode(String(inviteToken))) {
            // A working account must not have its role, club or status rewritten
            // by a code (an admin opening a coach code would lock themselves out).
            if (req.user && req.user.status === 'active') {
                return res.status(409).json({ error: ACTIVE_ACCOUNT_ERROR });
            }
            const consumed = await consumeInviteCode(String(inviteToken));
            if (!consumed) {
                return res.status(400).json({ error: 'Codul de invitație nu este valid, a expirat sau a atins numărul maxim de utilizări.' });
            }

            try {
                const kids = consumed.role === 'parent' ? childrenInput : null;
                const needsApproval = consumed.role === 'coach';
                let team: { id: number; name: string } | null = null;
                if (kids && consumed.teamId != null) {
                    team = await findClubTeam(consumed.clubId, consumed.teamId);
                    if (!team) {
                        throw new Error('Echipa din acest cod nu mai există. Cere un cod nou administratorului clubului.');
                    }
                }
                const teamId = team?.id ?? null;

                const values = {
                    firebaseUid: firebaseUser.uid,
                    email: firebaseUser.email || '',
                    name,
                    firstName,
                    lastName,
                    role: consumed.role as any,
                    status: needsApproval ? ('pending' as const) : ('active' as const),
                    clubId: consumed.clubId,
                    ...(phone ? { phone } : {}),
                };
                const saved = req.user
                    ? await db.update(users).set({ ...values, updatedAt: new Date().toISOString() }).where(eq(users.id, req.user.id)).returning()
                    : await db.insert(users).values(values).returning();
                const userRecord = saved[0];
                let status: 'active' | 'pending' = values.status;
                let requestedChildren = 0;

                if (needsApproval) {
                    await createPendingAccessRequestForSignup({ userId: userRecord.id, clubId: consumed.clubId, role: 'coach' });
                    void notifyReviewers({ clubId: consumed.clubId, requesterId: userRecord.id, requesterName: name, role: 'coach' });
                } else if (kids && team) {
                    const placed = await placeChildrenForParent({
                        userId: userRecord.id,
                        team: { id: team.id, clubId: consumed.clubId },
                        phone: phone!,
                        firstName,
                        lastName,
                        children: kids,
                    });
                    requestedChildren = placed.requested.length;
                    if (requestedChildren > 0) {
                        void notifyReviewers({
                            clubId: consumed.clubId,
                            teamId: team.id,
                            requesterId: userRecord.id,
                            requesterName: name,
                            role: 'parent',
                            teamName: team.name,
                            children: placed.requested.map((request) => `${request.childFirstName} ${request.childLastName}`),
                        });
                    }
                    // Every child is already on the roster (second parent of the
                    // family): in once the club confirms the link.
                    if (placed.created.length === 0 && requestedChildren > 0) {
                        await db.update(users).set({ status: 'pending' }).where(eq(users.id, userRecord.id));
                        status = 'pending';
                    }
                } else if (kids) {
                    await createChildrenForParent({ userId: userRecord.id, teamId, children: kids });
                }

                await writeAuditLog({
                    action: 'auth.signup_with_invite_code',
                    entityType: 'club_invite_code',
                    entityId: consumed.id,
                    actorUserId: userRecord.id,
                    actorUid: firebaseUser.uid,
                    actorRole: consumed.role,
                    clubId: consumed.clubId,
                    metadata: kids ? { children: kids.length, teamId, awaitingLink: requestedChildren } : needsApproval ? { pendingApproval: true } : null,
                    ipAddress: req.ip ?? null,
                    userAgent: req.get('user-agent') ?? null,
                });

                return res.status(201).json({
                    success: true,
                    user: { userId: userRecord.id, clubId: consumed.clubId, role: consumed.role, status },
                });
            } catch (error) {
                await releaseInviteCodeUse(consumed.id).catch(() => undefined);
                throw error;
            }
        }

        const classicInvitation = await validateInvitationToken(String(inviteToken));

        if (classicInvitation) {
            result = await acceptInvitation({
                token: inviteToken,
                firebaseUid: firebaseUser.uid,
                email: firebaseUser.email || '',
                firstName,
                lastName,
            });
            if (phone) {
                await db.update(users).set({ phone }).where(eq(users.firebaseUid, firebaseUser.uid));
            }
        } else {
            const manageAccessInvite = await validateInviteToken(String(inviteToken));
            if (req.user && req.user.status === 'active') {
                return res.status(409).json({ error: ACTIVE_ACCOUNT_ERROR });
            }
            let userRecord = req.user;

            if (!userRecord) {
                const inserted = await db.insert(users).values({
                    firebaseUid: firebaseUser.uid,
                    email: firebaseUser.email || '',
                    name,
                    firstName,
                    lastName,
                    role: manageAccessInvite.role as any,
                    status: 'pending',
                    clubId: manageAccessInvite.clubId,
                    ...(phone ? { phone } : {}),
                }).returning();
                userRecord = inserted[0];
            } else {
                const updated = await db.update(users).set({
                    firebaseUid: firebaseUser.uid,
                    email: firebaseUser.email || '',
                    name,
                    firstName,
                    lastName,
                    role: manageAccessInvite.role as any,
                    status: 'pending',
                    clubId: manageAccessInvite.clubId,
                    ...(phone ? { phone } : {}),
                    updatedAt: new Date().toISOString(),
                }).where(eq(users.id, req.user.id)).returning();
                userRecord = updated[0];
            }

            const kids = manageAccessInvite.role === 'parent' ? childrenInput : null;
            const linkTeam = kids && manageAccessInvite.teamId != null
                ? await findClubTeam(manageAccessInvite.clubId, manageAccessInvite.teamId)
                : null;

            if (kids && linkTeam) {
                // Link tied to a team: the children wait in the team's join
                // requests, where a club admin or the coach approves them (and
                // that approval lets the account in).
                const [teamRow] = await db.select().from(teams).where(eq(teams.id, linkTeam.id)).limit(1);
                await createJoinRequests({
                    userId: userRecord.id,
                    team: teamRow,
                    input: { kind: 'parent', phone: phone!, children: kids },
                    firstName,
                    lastName,
                });
                void notifyReviewers({
                    clubId: manageAccessInvite.clubId,
                    teamId: teamRow.id,
                    requesterId: userRecord.id,
                    requesterName: name,
                    role: 'parent',
                    teamName: teamRow.name,
                    children: kids.map((child) => `${child.firstName} ${child.lastName}`),
                });
            } else {
                if (kids) {
                    await createChildrenForParent({ userId: userRecord.id, teamId: null, children: kids });
                }
                await createPendingAccessRequestForSignup({
                    userId: userRecord.id,
                    clubId: manageAccessInvite.clubId,
                    role: manageAccessInvite.role as 'player' | 'parent' | 'coach',
                });
                void notifyReviewers({
                    clubId: manageAccessInvite.clubId,
                    requesterId: userRecord.id,
                    requesterName: name,
                    role: manageAccessInvite.role,
                });
            }

            result = {
                userId: userRecord.id,
                clubId: manageAccessInvite.clubId,
                role: manageAccessInvite.role,
                status: 'pending',
            };
        }

        res.status(201).json({
            success: true,
            user: result
        });
    } catch (error) {
        console.error('Complete invite signup error:', error);
        const message = error instanceof Error ? error.message : 'Internal server error';
        res.status(400).json({ error: message });
    }
});

export default router;
