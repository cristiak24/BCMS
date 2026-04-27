"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const drizzle_orm_1 = require("drizzle-orm");
const auth_1 = require("../middleware/auth");
const schema_1 = require("../db/schema");
const db_1 = require("../db");
const auditService_1 = require("../services/auditService");
const router = (0, express_1.Router)();
function withClubName(row, clubMap) {
    return {
        ...row,
        clubName: row.clubId == null ? null : clubMap.get(row.clubId) ?? null,
    };
}
function toClubSummary(club, userRows, inviteRows) {
    const clubUsers = userRows.filter((user) => user.clubId === club.id);
    return {
        ...club,
        status: 'active',
        usersCount: clubUsers.length,
        userCount: clubUsers.length,
        adminsCount: clubUsers.filter((user) => user.role === 'admin').length,
        adminCount: clubUsers.filter((user) => user.role === 'admin').length,
        coachCount: clubUsers.filter((user) => user.role === 'coach').length,
        staffCount: clubUsers.filter((user) => user.role === 'staff' || user.role === 'accountant').length,
        playerCount: clubUsers.filter((user) => user.role === 'player').length,
        pendingInviteCount: inviteRows.filter((invite) => invite.clubId === club.id && invite.status === 'pending').length,
    };
}
router.use(auth_1.authenticate, auth_1.requireSuperadmin);
router.get('/dashboard', async (_req, res) => {
    try {
        const [clubRows, userRows, inviteRows, auditRows] = await Promise.all([
            db_1.db.select().from(schema_1.clubs),
            db_1.db.select().from(schema_1.users),
            db_1.db.select().from(schema_1.invites),
            db_1.db.select().from(schema_1.auditLogs).orderBy((0, drizzle_orm_1.desc)(schema_1.auditLogs.createdAt)).limit(8),
        ]);
        const clubMap = new Map(clubRows.map((club) => [club.id, club.name]));
        const stats = {
            clubs: clubRows.length,
            users: userRows.length,
            admins: userRows.filter((user) => user.role === 'admin').length,
            coaches: userRows.filter((user) => user.role === 'coach').length,
            staff: userRows.filter((user) => user.role === 'staff' || user.role === 'accountant').length,
            players: userRows.filter((user) => user.role === 'player').length,
            pendingInvites: inviteRows.filter((invite) => invite.status === 'pending').length,
            inactiveUsers: userRows.filter((user) => user.status === 'disabled').length,
        };
        const clubPreview = clubRows.slice(0, 6).map((club) => toClubSummary(club, userRows, inviteRows));
        res.json({
            success: true,
            stats,
            clubs: clubPreview,
            recentAuditLogs: auditRows.map((row) => ({
                ...row,
                clubName: row.clubId == null ? null : clubMap.get(row.clubId) ?? null,
            })),
        });
    }
    catch (error) {
        console.error('Super admin dashboard error:', error);
        res.status(500).json({ error: 'Could not load dashboard.' });
    }
});
router.get('/clubs', async (_req, res) => {
    try {
        const [clubRows, userRows, inviteRows] = await Promise.all([
            db_1.db.select().from(schema_1.clubs).orderBy((0, drizzle_orm_1.desc)(schema_1.clubs.updatedAt)),
            db_1.db.select().from(schema_1.users),
            db_1.db.select().from(schema_1.invites),
        ]);
        const data = clubRows.map((club) => toClubSummary(club, userRows, inviteRows));
        res.json({ success: true, clubs: data });
    }
    catch (error) {
        console.error('List clubs error:', error);
        res.status(500).json({ error: 'Could not load clubs.' });
    }
});
router.post('/clubs', async (req, res) => {
    try {
        const name = String(req.body?.name ?? '').trim();
        if (!name) {
            return res.status(400).json({ error: 'Club name is required.' });
        }
        const normalizedName = name.toLowerCase();
        const existing = await db_1.db.select().from(schema_1.clubs).where((0, drizzle_orm_1.eq)(schema_1.clubs.normalizedName, normalizedName)).limit(1);
        if (existing[0]) {
            return res.status(409).json({ error: 'Club already exists.' });
        }
        const inserted = await db_1.db.insert(schema_1.clubs).values({
            name,
            normalizedName,
            createdBy: req.user?.id == null ? null : String(req.user.id),
        }).returning();
        await (0, auditService_1.writeAuditLog)({
            action: 'club.created',
            entityType: 'club',
            entityId: inserted[0].id,
            actorUserId: req.user?.id ?? null,
            actorUid: req.firebaseUser?.uid ?? null,
            actorRole: req.user?.role ?? null,
            clubId: inserted[0].id,
            metadata: { name },
        });
        const summary = {
            ...inserted[0],
            status: 'active',
            usersCount: 0,
            userCount: 0,
            adminsCount: 0,
            adminCount: 0,
            coachCount: 0,
            staffCount: 0,
            playerCount: 0,
            pendingInviteCount: 0,
        };
        res.status(201).json({ success: true, club: summary });
    }
    catch (error) {
        console.error('Create club error:', error);
        res.status(500).json({ error: 'Could not create club.' });
    }
});
router.get('/users', async (_req, res) => {
    try {
        const [userRows, clubRows, inviteRows] = await Promise.all([
            db_1.db.select().from(schema_1.users).orderBy((0, drizzle_orm_1.desc)(schema_1.users.createdAt)),
            db_1.db.select().from(schema_1.clubs),
            db_1.db.select().from(schema_1.invites),
        ]);
        const clubMap = new Map(clubRows.map((club) => [club.id, club.name]));
        const pendingInvites = inviteRows
            .filter((invite) => invite.status === 'pending')
            .map((invite) => ({
            id: `invite-${invite.id}`,
            email: invite.email,
            name: invite.email.split('@')[0],
            role: invite.role,
            status: invite.status,
            clubId: invite.clubId,
            clubName: invite.clubId == null ? null : clubMap.get(invite.clubId) ?? null,
            createdAt: invite.createdAt,
            lastLoginAt: null,
            source: 'invite',
        }));
        const activeUsers = userRows.map((user) => ({
            ...user,
            status: user.status === 'pending' ? 'pending_registration' : user.status === 'disabled' ? 'inactive' : 'active',
            clubName: user.clubId == null ? null : clubMap.get(user.clubId) ?? null,
            source: 'user',
        }));
        res.json({ success: true, users: [...pendingInvites, ...activeUsers].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))) });
    }
    catch (error) {
        console.error('List users error:', error);
        res.status(500).json({ error: 'Could not load users.' });
    }
});
router.patch('/users/:id', async (req, res) => {
    try {
        const id = Number(req.params.id);
        if (Number.isNaN(id)) {
            return res.status(400).json({ error: 'Invalid user id.' });
        }
        const payload = {};
        if (typeof req.body?.name === 'string')
            payload.name = req.body.name.trim();
        if (typeof req.body?.role === 'string')
            payload.role = req.body.role;
        if (typeof req.body?.status === 'string')
            payload.status = req.body.status;
        if (req.body?.clubId != null)
            payload.clubId = Number(req.body.clubId);
        const updated = await db_1.db.update(schema_1.users).set({
            ...(payload.name ? { name: String(payload.name) } : {}),
            ...(payload.role ? { role: String(payload.role) } : {}),
            ...(payload.status ? { status: String(payload.status) } : {}),
            ...(payload.clubId != null ? { clubId: Number(payload.clubId) } : {}),
            updatedAt: new Date().toISOString(),
        }).where((0, drizzle_orm_1.eq)(schema_1.users.id, id)).returning();
        if (!updated[0]) {
            return res.status(404).json({ error: 'User not found.' });
        }
        await (0, auditService_1.writeAuditLog)({
            action: 'user.updated',
            entityType: 'user',
            entityId: id,
            actorUserId: req.user?.id ?? null,
            actorUid: req.firebaseUser?.uid ?? null,
            actorRole: req.user?.role ?? null,
            clubId: updated[0].clubId ?? null,
            metadata: payload,
        });
        res.json({ success: true, user: updated[0] });
    }
    catch (error) {
        console.error('Update user error:', error);
        res.status(500).json({ error: 'Could not update user.' });
    }
});
router.post('/users/:id/deactivate', async (req, res) => {
    try {
        const id = Number(req.params.id);
        if (Number.isNaN(id)) {
            return res.status(400).json({ error: 'Invalid user id.' });
        }
        const updated = await db_1.db.update(schema_1.users).set({
            status: 'disabled',
            updatedAt: new Date().toISOString(),
        }).where((0, drizzle_orm_1.eq)(schema_1.users.id, id)).returning();
        if (!updated[0]) {
            return res.status(404).json({ error: 'User not found.' });
        }
        await (0, auditService_1.writeAuditLog)({
            action: 'user.deactivated',
            entityType: 'user',
            entityId: id,
            actorUserId: req.user?.id ?? null,
            actorUid: req.firebaseUser?.uid ?? null,
            actorRole: req.user?.role ?? null,
            clubId: updated[0].clubId ?? null,
        });
        res.json({ success: true, user: updated[0] });
    }
    catch (error) {
        console.error('Deactivate user error:', error);
        res.status(500).json({ error: 'Could not deactivate user.' });
    }
});
router.get('/audit-logs', async (_req, res) => {
    try {
        const rows = await db_1.db.select().from(schema_1.auditLogs).orderBy((0, drizzle_orm_1.desc)(schema_1.auditLogs.createdAt)).limit(100);
        res.json({ success: true, logs: rows });
    }
    catch (error) {
        console.error('Audit logs error:', error);
        res.status(500).json({ error: 'Could not load audit logs.' });
    }
});
router.get('/roles', async (_req, res) => {
    res.json({
        success: true,
        roles: [
            {
                code: 'superadmin',
                label: 'Super Admin',
                scope: 'global',
                permissions: ['platform.manage', 'clubs.manage', 'users.manage', 'invites.manage', 'audit.read', 'settings.manage'],
            },
            {
                code: 'admin',
                label: 'Club Admin',
                scope: 'club',
                permissions: ['club.manage', 'users.manage', 'invites.manage', 'schedule.manage'],
            },
            {
                code: 'coach',
                label: 'Coach',
                scope: 'club',
                permissions: ['roster.read', 'schedule.manage'],
            },
            {
                code: 'staff',
                label: 'Staff',
                scope: 'club',
                permissions: ['users.read', 'attendance.read'],
            },
            {
                code: 'player',
                label: 'Player',
                scope: 'club',
                permissions: ['profile.read', 'schedule.read'],
            },
        ],
    });
});
router.get('/settings', (_req, res) => {
    res.json({
        success: true,
        settings: {
            inviteTtlHours: process.env.INVITE_TTL_HOURS ?? '168',
            resendFromEmail: process.env.RESEND_FROM_EMAIL ?? 'BCMS <onboarding@resend.dev>',
        },
    });
});
exports.default = router;
