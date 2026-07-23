"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const drizzle_orm_1 = require("drizzle-orm");
const auth_1 = require("../middleware/auth");
const schema_1 = require("../db/schema");
const db_1 = require("../db");
const invitationsService_1 = require("../services/invitationsService");
const auditService_1 = require("../services/auditService");
const rateLimit_1 = require("../middleware/rateLimit");
const microCache_1 = require("../lib/microCache");
const router = (0, express_1.Router)();
// Roles that must never be demoted / deactivated from the club-admin screen —
// this is what protects the club from an admin locking themselves (or the last
// admin) out.
const PRIVILEGED_ROLES = new Set(['admin', 'superadmin']);
// Short-lived cache for the read-heavy accounts listing (invitation sync + a few
// queries). Invalidated immediately on any mutation in this process.
const ACCOUNTS_CACHE_TTL_MS = 15_000;
const accountsCacheKey = (clubId) => `club-admin:accounts:${clubId}`;
// Explicit, safe column projection — never expose passwordHash / firebaseUid / uid.
const safeUserColumns = {
    id: schema_1.users.id,
    email: schema_1.users.email,
    name: schema_1.users.name,
    firstName: schema_1.users.firstName,
    lastName: schema_1.users.lastName,
    role: schema_1.users.role,
    status: schema_1.users.status,
    clubId: schema_1.users.clubId,
    avatarUrl: schema_1.users.avatarUrl,
    phone: schema_1.users.phone,
    lastLoginAt: schema_1.users.lastLoginAt,
    createdAt: schema_1.users.createdAt,
    updatedAt: schema_1.users.updatedAt,
};
function normalizeClubAdminInviteRole(value) {
    return value === 'coach' || value === 'player' ? value : null;
}
function normalizeClubAdminAssignableRole(value) {
    return value === 'coach' || value === 'player' || value === 'parent' ? value : null;
}
function ensureClubAdmin(req, res) {
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
router.use(auth_1.authenticate);
router.get('/accounts', async (req, res) => {
    const actor = ensureClubAdmin(req, res);
    if (!actor) {
        return;
    }
    try {
        const clubId = actor.clubId;
        const payload = await (0, microCache_1.getOrCompute)(accountsCacheKey(clubId), ACCOUNTS_CACHE_TTL_MS, async () => {
            await (0, invitationsService_1.syncInvitationStatuses)();
            const [clubRows, userRows, inviteRows] = await Promise.all([
                db_1.db.select({ id: schema_1.clubs.id, name: schema_1.clubs.name }).from(schema_1.clubs).where((0, drizzle_orm_1.eq)(schema_1.clubs.id, clubId)).limit(1),
                db_1.db.select(safeUserColumns).from(schema_1.users).where((0, drizzle_orm_1.eq)(schema_1.users.clubId, clubId)).orderBy((0, drizzle_orm_1.desc)(schema_1.users.createdAt)),
                db_1.db.select().from(schema_1.invites).where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.invites.clubId, clubId), (0, drizzle_orm_1.eq)(schema_1.invites.status, 'pending'))).orderBy((0, drizzle_orm_1.desc)(schema_1.invites.createdAt)),
            ]);
            const clubName = clubRows[0]?.name ?? null;
            const pendingInvites = inviteRows
                .filter((invite) => (0, invitationsService_1.isVisiblePendingInvite)(invite, userRows))
                .map((invite) => ({
                id: `invite-${invite.id}`,
                email: invite.email,
                name: invite.email.split('@')[0],
                role: invite.role,
                status: invite.status,
                clubId: invite.clubId,
                clubName,
                createdAt: invite.createdAt,
                lastLoginAt: null,
                source: 'invite',
            }));
            const activeUsers = userRows.map((user) => ({
                ...user,
                status: user.status === 'pending' ? 'pending_registration' : user.status === 'disabled' ? 'inactive' : 'active',
                clubName,
                source: 'user',
            }));
            return {
                success: true,
                users: [...pendingInvites, ...activeUsers].sort((a, b) => String(b.createdAt ?? '').localeCompare(String(a.createdAt ?? ''))),
            };
        });
        res.json(payload);
    }
    catch (error) {
        console.error('Club admin accounts error:', error);
        res.status(500).json({ error: 'Could not load club accounts.' });
    }
});
router.post('/accounts/invitations', (0, rateLimit_1.rateLimit)({ bucket: 'club-admin:invite', limit: 10, windowMs: 60_000 }), async (req, res) => {
    const actor = ensureClubAdmin(req, res);
    if (!actor) {
        return;
    }
    const role = normalizeClubAdminInviteRole(req.body?.role);
    if (!role) {
        return res.status(400).json({ error: 'Only coach and player roles can be invited from club admin.' });
    }
    try {
        const result = await (0, invitationsService_1.createSuperAdminInvitation)({
            email: String(req.body?.email ?? ''),
            fullName: String(req.body?.fullName ?? ''),
            role,
            clubId: actor.clubId,
        }, {
            user: req.user,
            firebaseUser: req.firebaseUser,
            ip: req.ip,
            userAgent: req.get('user-agent') ?? undefined,
        });
        (0, microCache_1.invalidate)(accountsCacheKey(actor.clubId));
        res.status(201).json({ success: true, invitation: result });
    }
    catch (error) {
        console.error('Club admin create invitation error:', error);
        const message = error instanceof Error ? error.message : 'Could not create invitation.';
        res.status(400).json({ error: message });
    }
});
router.patch('/accounts/:id', (0, rateLimit_1.rateLimit)({ bucket: 'club-admin:mutate', limit: 30, windowMs: 60_000 }), async (req, res) => {
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
        const currentRows = await db_1.db
            .select()
            .from(schema_1.users)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.users.id, id), (0, drizzle_orm_1.eq)(schema_1.users.clubId, actor.clubId)))
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
        const updated = await db_1.db.update(schema_1.users).set({
            role: nextRole,
            updatedAt: new Date().toISOString(),
        }).where((0, drizzle_orm_1.eq)(schema_1.users.id, id)).returning();
        await (0, auditService_1.writeAuditLog)({
            action: 'club_admin.user_role_updated',
            entityType: 'user',
            entityId: id,
            actorUserId: req.user?.id ?? null,
            actorUid: req.firebaseUser?.uid ?? null,
            actorRole: req.user?.role ?? null,
            clubId: actor.clubId,
            metadata: { previousRole: currentUser.role, nextRole },
        });
        (0, microCache_1.invalidate)(accountsCacheKey(actor.clubId));
        res.json({ success: true, user: updated[0] });
    }
    catch (error) {
        console.error('Club admin update user error:', error);
        res.status(500).json({ error: 'Could not update user role.' });
    }
});
router.post('/accounts/:id/deactivate', (0, rateLimit_1.rateLimit)({ bucket: 'club-admin:mutate', limit: 30, windowMs: 60_000 }), async (req, res) => {
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
            const inviteRows = await db_1.db
                .select()
                .from(schema_1.invites)
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.invites.id, inviteId), (0, drizzle_orm_1.eq)(schema_1.invites.clubId, actor.clubId)))
                .limit(1);
            const invite = inviteRows[0];
            if (!invite) {
                return res.status(404).json({ error: 'Invite not found in your club.' });
            }
            const updatedInvite = await db_1.db.update(schema_1.invites).set({ status: 'revoked' }).where((0, drizzle_orm_1.eq)(schema_1.invites.id, inviteId)).returning();
            await (0, auditService_1.writeAuditLog)({
                action: 'club_admin.invitation_revoked',
                entityType: 'invitation',
                entityId: inviteId,
                actorUserId: req.user?.id ?? null,
                actorUid: req.firebaseUser?.uid ?? null,
                actorRole: req.user?.role ?? null,
                clubId: actor.clubId,
                metadata: { email: invite.email, role: invite.role },
            });
            (0, microCache_1.invalidate)(accountsCacheKey(actor.clubId));
            return res.json({ success: true, invitation: updatedInvite[0] ?? invite });
        }
        const id = Number(rawId);
        if (Number.isNaN(id)) {
            return res.status(400).json({ error: 'Invalid user id.' });
        }
        if (req.user?.id === id) {
            return res.status(400).json({ error: 'You cannot deactivate your own account from this screen.' });
        }
        const userRows = await db_1.db
            .select()
            .from(schema_1.users)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.users.id, id), (0, drizzle_orm_1.eq)(schema_1.users.clubId, actor.clubId)))
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
        const updated = await db_1.db.update(schema_1.users).set({
            status: 'disabled',
            updatedAt: new Date().toISOString(),
        }).where((0, drizzle_orm_1.eq)(schema_1.users.id, id)).returning();
        await (0, auditService_1.writeAuditLog)({
            action: 'club_admin.user_deactivated',
            entityType: 'user',
            entityId: id,
            actorUserId: req.user?.id ?? null,
            actorUid: req.firebaseUser?.uid ?? null,
            actorRole: req.user?.role ?? null,
            clubId: actor.clubId,
            metadata: { email: targetUser.email, role: targetUser.role },
        });
        (0, microCache_1.invalidate)(accountsCacheKey(actor.clubId));
        res.json({ success: true, user: updated[0] });
    }
    catch (error) {
        console.error('Club admin deactivate account error:', error);
        res.status(500).json({ error: 'Could not update this account.' });
    }
});
router.post('/accounts/:id/resend', (0, rateLimit_1.rateLimit)({ bucket: 'club-admin:invite', limit: 10, windowMs: 60_000 }), async (req, res) => {
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
        const invitation = await (0, invitationsService_1.resendClubInvitation)({ inviteId, clubId: actor.clubId }, {
            user: req.user,
            firebaseUser: req.firebaseUser,
            ip: req.ip,
            userAgent: req.get('user-agent') ?? undefined,
        });
        (0, microCache_1.invalidate)(accountsCacheKey(actor.clubId));
        res.json({ success: true, invitation });
    }
    catch (error) {
        console.error('Club admin resend invitation error:', error);
        const message = error instanceof Error ? error.message : 'Could not resend the invitation.';
        const status = message.includes('not found') ? 404 : 400;
        res.status(status).json({ error: message });
    }
});
router.post('/accounts/:id/reactivate', (0, rateLimit_1.rateLimit)({ bucket: 'club-admin:mutate', limit: 30, windowMs: 60_000 }), async (req, res) => {
    const actor = ensureClubAdmin(req, res);
    if (!actor) {
        return;
    }
    try {
        const id = Number(req.params.id);
        if (Number.isNaN(id)) {
            return res.status(400).json({ error: 'Invalid user id.' });
        }
        const userRows = await db_1.db
            .select()
            .from(schema_1.users)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.users.id, id), (0, drizzle_orm_1.eq)(schema_1.users.clubId, actor.clubId)))
            .limit(1);
        const targetUser = userRows[0];
        if (!targetUser) {
            return res.status(404).json({ error: 'User not found in your club.' });
        }
        if (targetUser.status !== 'disabled') {
            return res.status(400).json({ error: 'Only deactivated accounts can be reactivated.' });
        }
        const updated = await db_1.db.update(schema_1.users).set({
            status: 'active',
            updatedAt: new Date().toISOString(),
        }).where((0, drizzle_orm_1.eq)(schema_1.users.id, id)).returning();
        await (0, auditService_1.writeAuditLog)({
            action: 'club_admin.user_reactivated',
            entityType: 'user',
            entityId: id,
            actorUserId: req.user?.id ?? null,
            actorUid: req.firebaseUser?.uid ?? null,
            actorRole: req.user?.role ?? null,
            clubId: actor.clubId,
            metadata: { email: targetUser.email, role: targetUser.role },
        });
        (0, microCache_1.invalidate)(accountsCacheKey(actor.clubId));
        res.json({ success: true, user: updated[0] });
    }
    catch (error) {
        console.error('Club admin reactivate account error:', error);
        res.status(500).json({ error: 'Could not reactivate this account.' });
    }
});
exports.default = router;
