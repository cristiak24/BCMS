import { Response, Router } from 'express';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { authenticate, type AuthenticatedRequest } from '../middleware/auth';
import { accessRequests, attendance, auditLogs, clubInviteCodes, clubs, events, inviteLinks, invites, notifications, playerPayments, players, playersToTeams, teams, users } from '../db/schema';
import { db } from '../db';
import { createSuperAdminInvitation, isVisiblePendingInvite, resendClubInvitation, syncInvitationStatuses } from '../services/invitationsService';
import { writeAuditLog } from '../services/auditService';
import { rateLimit } from '../middleware/rateLimit';
import { getOrCompute, invalidate } from '../lib/microCache';
import { deleteClerkUser } from '../lib/clerkAuth';

const router = Router();

type ClubAdminInviteRole = 'coach' | 'player';
// Roles an admin may assign to an existing member from this screen. `parent` is
// assignable (a member can be reclassified) even though invitations stay limited
// to coach/player.
type ClubAdminAssignableRole = 'coach' | 'player' | 'parent';
// Roles that must never be demoted / deactivated from the club-admin screen —
// this is what protects the club from an admin locking themselves (or the last
// admin) out.
const PRIVILEGED_ROLES = new Set(['admin', 'superadmin']);

// Short-lived cache for the read-heavy accounts listing (invitation sync + a few
// queries). Invalidated immediately on any mutation in this process.
const ACCOUNTS_CACHE_TTL_MS = 15_000;
const accountsCacheKey = (clubId: number) => `club-admin:accounts:${clubId}`;

// Explicit, safe column projection — never expose passwordHash / firebaseUid / uid.
const safeUserColumns = {
    id: users.id,
    email: users.email,
    name: users.name,
    firstName: users.firstName,
    lastName: users.lastName,
    role: users.role,
    status: users.status,
    clubId: users.clubId,
    avatarUrl: users.avatarUrl,
    phone: users.phone,
    lastLoginAt: users.lastLoginAt,
    createdAt: users.createdAt,
    updatedAt: users.updatedAt,
} as const;

function normalizeClubAdminInviteRole(value: unknown): ClubAdminInviteRole | null {
    return value === 'coach' || value === 'player' ? value : null;
}

function normalizeClubAdminAssignableRole(value: unknown): ClubAdminAssignableRole | null {
    return value === 'coach' || value === 'player' || value === 'parent' ? value : null;
}

function ensureClubAdmin(req: AuthenticatedRequest, res: Response) {
    if (!req.user) {
        res.status(401).json({ error: 'Authentication required.' });
        return null;
    }

    if ((req.user.role !== 'admin' && req.user.role !== 'superadmin') || req.user.clubId == null) {
        res.status(403).json({ error: 'Club admin access is required.' });
        return null;
    }

    return req.user;
}

router.use(authenticate);

router.get('/accounts', async (req: AuthenticatedRequest, res) => {
    const actor = ensureClubAdmin(req, res);

    if (!actor) {
        return;
    }

    try {
        const clubId = actor.clubId!;

        const payload = await getOrCompute(accountsCacheKey(clubId), ACCOUNTS_CACHE_TTL_MS, async () => {
            await syncInvitationStatuses();

            const [clubRows, userRows, inviteRows] = await Promise.all([
                db.select({ id: clubs.id, name: clubs.name }).from(clubs).where(eq(clubs.id, clubId)).limit(1),
                db.select(safeUserColumns).from(users).where(eq(users.clubId, clubId)).orderBy(desc(users.createdAt)),
                db.select().from(invites).where(and(eq(invites.clubId, clubId), eq(invites.status, 'pending'))).orderBy(desc(invites.createdAt)),
            ]);

            const clubName = clubRows[0]?.name ?? null;
            const visibleInvites = inviteRows.filter((invite) => isVisiblePendingInvite(invite, userRows));

            // The admin-only label typed on the invite form isn't a column on
            // `invites`; it lives in the invitation.created audit entry.
            const inviteLabels = new Map<string, string>();
            if (visibleInvites.length > 0) {
                const labelRows = await db
                    .select({ entityId: auditLogs.entityId, metadata: auditLogs.metadata })
                    .from(auditLogs)
                    .where(and(
                        eq(auditLogs.action, 'invitation.created'),
                        eq(auditLogs.entityType, 'invitation'),
                        inArray(auditLogs.entityId, visibleInvites.map((invite) => String(invite.id))),
                    ));
                for (const row of labelRows) {
                    try {
                        const label = JSON.parse(row.metadata ?? '{}')?.fullName;
                        if (row.entityId && typeof label === 'string' && label.trim()) {
                            inviteLabels.set(row.entityId, label.trim());
                        }
                    } catch {
                        // Unparseable metadata — fall back to the email prefix.
                    }
                }
            }

            const pendingInvites = visibleInvites
                .map((invite) => ({
                    id: `invite-${invite.id}`,
                    email: invite.email,
                    name: inviteLabels.get(String(invite.id)) ?? invite.email.split('@')[0],
                    role: invite.role,
                    status: invite.status,
                    clubId: invite.clubId,
                    clubName,
                    createdAt: invite.createdAt,
                    lastLoginAt: null,
                    source: 'invite' as const,
                }));

            const activeUsers = userRows.map((user) => ({
                ...user,
                status: user.status === 'pending' ? 'pending_registration' : user.status === 'disabled' ? 'inactive' : 'active',
                clubName,
                source: 'user' as const,
            }));

            return {
                success: true,
                users: [...pendingInvites, ...activeUsers].sort((a, b) => String(b.createdAt ?? '').localeCompare(String(a.createdAt ?? ''))),
            };
        });

        res.json(payload);
    } catch (error) {
        console.error('Club admin accounts error:', error);
        res.status(500).json({ error: 'Could not load club accounts.' });
    }
});

router.post('/accounts/invitations', rateLimit({ bucket: 'club-admin:invite', limit: 10, windowMs: 60_000 }), async (req: AuthenticatedRequest, res) => {
    const actor = ensureClubAdmin(req, res);

    if (!actor) {
        return;
    }

    const role = normalizeClubAdminInviteRole(req.body?.role);

    if (!role) {
        return res.status(400).json({ error: 'Only coach and player roles can be invited from club admin.' });
    }

    try {
        const result = await createSuperAdminInvitation(
            {
                email: String(req.body?.email ?? ''),
                fullName: String(req.body?.fullName ?? ''),
                role,
                clubId: actor.clubId!,
            },
            {
                user: req.user,
                firebaseUser: req.firebaseUser,
                ip: req.ip,
                userAgent: req.get('user-agent') ?? undefined,
            },
        );

        invalidate(accountsCacheKey(actor.clubId!));
        res.status(201).json({ success: true, invitation: result });
    } catch (error) {
        console.error('Club admin create invitation error:', error);
        const message = error instanceof Error ? error.message : 'Could not create invitation.';
        res.status(400).json({ error: message });
    }
});

router.patch('/accounts/:id', rateLimit({ bucket: 'club-admin:mutate', limit: 30, windowMs: 60_000 }), async (req: AuthenticatedRequest, res) => {
    const actor = ensureClubAdmin(req, res);

    if (!actor) {
        return;
    }

    const id = Number(req.params.id);
    const nextRole = normalizeClubAdminAssignableRole(req.body?.role);

    if (Number.isNaN(id)) {
        return res.status(400).json({ error: 'Invalid user id.' });
    }

    if (!nextRole) {
        return res.status(400).json({ error: 'Only coach, player, and parent roles can be assigned from club admin.' });
    }

    // Self-guard: an admin changing their own role could drop their admin rights
    // and lock themselves out of every admin route (a 403 on the next request).
    if (req.user?.id === id) {
        return res.status(400).json({ error: 'You cannot change your own role from this screen.' });
    }

    try {
        const currentRows = await db
            .select()
            .from(users)
            .where(and(eq(users.id, id), eq(users.clubId, actor.clubId!)))
            .limit(1);

        const currentUser = currentRows[0];

        if (!currentUser) {
            return res.status(404).json({ error: 'User not found in your club.' });
        }

        // Never demote another admin/superadmin from this screen. Combined with the
        // self-guard above, this guarantees the club can never lose its last admin
        // through a role change.
        if (PRIVILEGED_ROLES.has(currentUser.role)) {
            return res.status(403).json({ error: 'Admin accounts cannot be reassigned from this screen.' });
        }

        const updated = await db.update(users).set({
            role: nextRole,
            updatedAt: new Date().toISOString(),
        }).where(eq(users.id, id)).returning();

        await writeAuditLog({
            action: 'club_admin.user_role_updated',
            entityType: 'user',
            entityId: id,
            actorUserId: req.user?.id ?? null,
            actorUid: req.firebaseUser?.uid ?? null,
            actorRole: req.user?.role ?? null,
            clubId: actor.clubId,
            metadata: { previousRole: currentUser.role, nextRole },
        });

        invalidate(accountsCacheKey(actor.clubId!));
        res.json({ success: true, user: updated[0] });
    } catch (error) {
        console.error('Club admin update user error:', error);
        res.status(500).json({ error: 'Could not update user role.' });
    }
});

router.post('/accounts/:id/deactivate', rateLimit({ bucket: 'club-admin:mutate', limit: 30, windowMs: 60_000 }), async (req: AuthenticatedRequest, res) => {
    const actor = ensureClubAdmin(req, res);

    if (!actor) {
        return;
    }

    try {
        const rawId = String(req.params.id);

        if (rawId.startsWith('invite-')) {
            const inviteId = Number(rawId.slice('invite-'.length));

            if (Number.isNaN(inviteId)) {
                return res.status(400).json({ error: 'Invalid invite id.' });
            }

            const inviteRows = await db
                .select()
                .from(invites)
                .where(and(eq(invites.id, inviteId), eq(invites.clubId, actor.clubId!)))
                .limit(1);

            const invite = inviteRows[0];

            if (!invite) {
                return res.status(404).json({ error: 'Invite not found in your club.' });
            }

            const updatedInvite = await db.update(invites).set({ status: 'revoked' }).where(eq(invites.id, inviteId)).returning();

            await writeAuditLog({
                action: 'club_admin.invitation_revoked',
                entityType: 'invitation',
                entityId: inviteId,
                actorUserId: req.user?.id ?? null,
                actorUid: req.firebaseUser?.uid ?? null,
                actorRole: req.user?.role ?? null,
                clubId: actor.clubId,
                metadata: { email: invite.email, role: invite.role },
            });

            invalidate(accountsCacheKey(actor.clubId!));
            return res.json({ success: true, invitation: updatedInvite[0] ?? invite });
        }

        const id = Number(rawId);

        if (Number.isNaN(id)) {
            return res.status(400).json({ error: 'Invalid user id.' });
        }

        if (req.user?.id === id) {
            return res.status(400).json({ error: 'You cannot deactivate your own account from this screen.' });
        }

        const userRows = await db
            .select()
            .from(users)
            .where(and(eq(users.id, id), eq(users.clubId, actor.clubId!)))
            .limit(1);

        const targetUser = userRows[0];

        if (!targetUser) {
            return res.status(404).json({ error: 'User not found in your club.' });
        }

        // Admin/superadmin accounts cannot be deactivated here — this prevents an
        // admin from disabling the club's last admin and locking everyone out.
        if (PRIVILEGED_ROLES.has(targetUser.role)) {
            return res.status(403).json({ error: 'Admin accounts cannot be deactivated from this screen.' });
        }

        const updated = await db.update(users).set({
            status: 'disabled',
            updatedAt: new Date().toISOString(),
        }).where(eq(users.id, id)).returning();

        await writeAuditLog({
            action: 'club_admin.user_deactivated',
            entityType: 'user',
            entityId: id,
            actorUserId: req.user?.id ?? null,
            actorUid: req.firebaseUser?.uid ?? null,
            actorRole: req.user?.role ?? null,
            clubId: actor.clubId,
            metadata: { email: targetUser.email, role: targetUser.role },
        });

        invalidate(accountsCacheKey(actor.clubId!));
        res.json({ success: true, user: updated[0] });
    } catch (error) {
        console.error('Club admin deactivate account error:', error);
        res.status(500).json({ error: 'Could not update this account.' });
    }
});

router.post('/accounts/:id/resend', rateLimit({ bucket: 'club-admin:invite', limit: 10, windowMs: 60_000 }), async (req: AuthenticatedRequest, res) => {
    const actor = ensureClubAdmin(req, res);

    if (!actor) {
        return;
    }

    const rawId = String(req.params.id);

    if (!rawId.startsWith('invite-')) {
        return res.status(400).json({ error: 'Only pending invitations can be resent.' });
    }

    const inviteId = Number(rawId.slice('invite-'.length));

    if (Number.isNaN(inviteId)) {
        return res.status(400).json({ error: 'Invalid invite id.' });
    }

    try {
        const invitation = await resendClubInvitation(
            { inviteId, clubId: actor.clubId! },
            {
                user: req.user,
                firebaseUser: req.firebaseUser,
                ip: req.ip,
                userAgent: req.get('user-agent') ?? undefined,
            },
        );

        invalidate(accountsCacheKey(actor.clubId!));
        res.json({ success: true, invitation });
    } catch (error) {
        console.error('Club admin resend invitation error:', error);
        const message = error instanceof Error ? error.message : 'Could not resend the invitation.';
        const status = message.includes('not found') ? 404 : 400;
        res.status(status).json({ error: message });
    }
});

router.post('/accounts/:id/reactivate', rateLimit({ bucket: 'club-admin:mutate', limit: 30, windowMs: 60_000 }), async (req: AuthenticatedRequest, res) => {
    const actor = ensureClubAdmin(req, res);

    if (!actor) {
        return;
    }

    try {
        const id = Number(req.params.id);

        if (Number.isNaN(id)) {
            return res.status(400).json({ error: 'Invalid user id.' });
        }

        const userRows = await db
            .select()
            .from(users)
            .where(and(eq(users.id, id), eq(users.clubId, actor.clubId!)))
            .limit(1);

        const targetUser = userRows[0];

        if (!targetUser) {
            return res.status(404).json({ error: 'User not found in your club.' });
        }

        if (targetUser.status !== 'disabled') {
            return res.status(400).json({ error: 'Only deactivated accounts can be reactivated.' });
        }

        const updated = await db.update(users).set({
            status: 'active',
            updatedAt: new Date().toISOString(),
        }).where(eq(users.id, id)).returning();

        await writeAuditLog({
            action: 'club_admin.user_reactivated',
            entityType: 'user',
            entityId: id,
            actorUserId: req.user?.id ?? null,
            actorUid: req.firebaseUser?.uid ?? null,
            actorRole: req.user?.role ?? null,
            clubId: actor.clubId,
            metadata: { email: targetUser.email, role: targetUser.role },
        });

        invalidate(accountsCacheKey(actor.clubId!));
        res.json({ success: true, user: updated[0] });
    } catch (error) {
        console.error('Club admin reactivate account error:', error);
        res.status(500).json({ error: 'Could not reactivate this account.' });
    }
});

// Permanently removes a member: the Postgres row, everything that only exists
// for that user, their roster record(s) in this club (players are linked to the
// account by email) with attendance, payments and team memberships, and their
// Clerk sign-in. References that are history (teams / events they coached,
// invites they sent, audit entries) are kept but detached.
// Irreversible — the client asks for explicit confirmation first.
router.delete('/accounts/:id', rateLimit({ bucket: 'club-admin:mutate', limit: 30, windowMs: 60_000 }), async (req: AuthenticatedRequest, res) => {
    const actor = ensureClubAdmin(req, res);

    if (!actor) {
        return;
    }

    const id = Number(req.params.id);

    if (Number.isNaN(id)) {
        return res.status(400).json({ error: 'Invalid user id.' });
    }

    if (req.user?.id === id) {
        return res.status(400).json({ error: 'You cannot delete your own account from this screen.' });
    }

    try {
        const userRows = await db
            .select()
            .from(users)
            .where(and(eq(users.id, id), eq(users.clubId, actor.clubId!)))
            .limit(1);

        const targetUser = userRows[0];

        if (!targetUser) {
            return res.status(404).json({ error: 'User not found in your club.' });
        }

        if (PRIVILEGED_ROLES.has(targetUser.role)) {
            return res.status(403).json({ error: 'Admin accounts cannot be deleted from this screen.' });
        }

        // Roster records for this person. Only ones that sit entirely inside the
        // admin's club are removed — a player row also attached to another
        // club's team is left alone.
        const linkedPlayers = await db
            .select({ id: players.id, teamId: players.teamId })
            .from(players)
            .where(sql`lower(${players.email}) = ${targetUser.email.trim().toLowerCase()}`);
        const linkedPlayerIds = linkedPlayers.map((player) => player.id);
        const membershipRows = linkedPlayerIds.length > 0
            ? await db
                .select({ playerId: playersToTeams.playerId, teamId: playersToTeams.teamId })
                .from(playersToTeams)
                .where(inArray(playersToTeams.playerId, linkedPlayerIds))
            : [];
        const teamIdsByPlayer = new Map<number, Set<number>>();
        for (const player of linkedPlayers) {
            teamIdsByPlayer.set(player.id, new Set(player.teamId != null ? [player.teamId] : []));
        }
        for (const row of membershipRows) {
            teamIdsByPlayer.get(row.playerId)?.add(row.teamId);
        }
        const allTeamIds = [...new Set(membershipRows.map((row) => row.teamId).concat(
            linkedPlayers.map((player) => player.teamId).filter((teamId): teamId is number => teamId != null),
        ))];
        const teamClubRows = allTeamIds.length > 0
            ? await db.select({ id: teams.id, clubId: teams.clubId }).from(teams).where(inArray(teams.id, allTeamIds))
            : [];
        const teamClub = new Map(teamClubRows.map((team) => [team.id, team.clubId]));
        const playerIdsToDelete = linkedPlayers
            .filter((player) => [...(teamIdsByPlayer.get(player.id) ?? [])].every((teamId) => teamClub.get(teamId) === actor.clubId))
            .map((player) => player.id);

        await db.transaction(async (tx) => {
            if (playerIdsToDelete.length > 0) {
                await tx.delete(attendance).where(inArray(attendance.playerId, playerIdsToDelete));
                await tx.delete(playerPayments).where(inArray(playerPayments.playerId, playerIdsToDelete));
                await tx.delete(playersToTeams).where(inArray(playersToTeams.playerId, playerIdsToDelete));
                await tx.delete(notifications).where(inArray(notifications.playerId, playerIdsToDelete));
                await tx.delete(players).where(inArray(players.id, playerIdsToDelete));
            }
            await tx.update(teams).set({ coachId: null }).where(eq(teams.coachId, id));
            await tx.update(events).set({ coachId: null }).where(eq(events.coachId, id));
            await tx.update(invites).set({ createdBy: null }).where(eq(invites.createdBy, id));
            await tx.update(invites).set({ usedBy: null }).where(eq(invites.usedBy, id));
            await tx.update(inviteLinks).set({ createdBy: null }).where(eq(inviteLinks.createdBy, id));
            await tx.update(clubInviteCodes).set({ createdBy: null }).where(eq(clubInviteCodes.createdBy, id));
            await tx.update(accessRequests).set({ reviewedBy: null }).where(eq(accessRequests.reviewedBy, id));
            await tx.update(auditLogs).set({ actorUserId: null }).where(eq(auditLogs.actorUserId, id));
            await tx.delete(notifications).where(eq(notifications.userId, id));
            await tx.delete(accessRequests).where(eq(accessRequests.userId, id));
            await tx.delete(users).where(eq(users.id, id));
        });

        // Remove the sign-in too, otherwise the person could still log in to a
        // Clerk session with no profile behind it. Best effort: the DB row is
        // already gone, so a Clerk failure is logged rather than surfaced.
        const clerkIds = [...new Set([targetUser.firebaseUid, targetUser.uid].filter((value): value is string => Boolean(value)))];
        for (const clerkId of clerkIds) {
            try {
                await deleteClerkUser(clerkId);
            } catch (clerkError) {
                console.error('Club admin delete account: Clerk user removal failed:', clerkError);
            }
        }

        await writeAuditLog({
            action: 'club_admin.user_deleted',
            entityType: 'user',
            entityId: id,
            actorUserId: req.user?.id ?? null,
            actorUid: req.firebaseUser?.uid ?? null,
            actorRole: req.user?.role ?? null,
            clubId: actor.clubId,
            metadata: { email: targetUser.email, name: targetUser.name, role: targetUser.role, deletedPlayerIds: playerIdsToDelete },
        });

        invalidate(accountsCacheKey(actor.clubId!));
        res.json({ success: true, deletedPlayers: playerIdsToDelete.length });
    } catch (error) {
        console.error('Club admin delete account error:', error);
        res.status(500).json({ error: 'Could not delete this account.' });
    }
});

export default router;
