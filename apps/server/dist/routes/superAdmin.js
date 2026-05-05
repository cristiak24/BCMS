"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const drizzle_orm_1 = require("drizzle-orm");
const auth_1 = require("../middleware/auth");
const schema_1 = require("../db/schema");
const db_1 = require("../db");
const auditService_1 = require("../services/auditService");
const invitationsService_1 = require("../services/invitationsService");
const router = (0, express_1.Router)();
function withClubName(row, clubMap) {
    var _a;
    return Object.assign(Object.assign({}, row), { clubName: row.clubId == null ? null : (_a = clubMap.get(row.clubId)) !== null && _a !== void 0 ? _a : null });
}
function toClubSummary(club, userRows, inviteRows) {
    const clubUsers = userRows.filter((user) => user.clubId === club.id);
    const now = new Date();
    return Object.assign(Object.assign({}, club), { status: 'active', usersCount: clubUsers.length, userCount: clubUsers.length, adminsCount: clubUsers.filter((user) => user.role === 'admin').length, adminCount: clubUsers.filter((user) => user.role === 'admin').length, coachCount: clubUsers.filter((user) => user.role === 'coach').length, staffCount: clubUsers.filter((user) => user.role === 'staff' || user.role === 'accountant').length, playerCount: clubUsers.filter((user) => user.role === 'player').length, pendingInviteCount: inviteRows.filter((invite) => invite.clubId === club.id && (0, invitationsService_1.isVisiblePendingInvite)(invite, userRows, now)).length });
}
router.use(auth_1.authenticate, auth_1.requireSuperadmin);
router.get('/dashboard', (_req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        yield (0, invitationsService_1.syncInvitationStatuses)();
        const [clubRows, userRows, inviteRows, auditRows] = yield Promise.all([
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
            pendingInvites: inviteRows.filter((invite) => (0, invitationsService_1.isVisiblePendingInvite)(invite, userRows)).length,
            inactiveUsers: userRows.filter((user) => user.status === 'disabled').length,
        };
        const clubPreview = clubRows.slice(0, 6).map((club) => toClubSummary(club, userRows, inviteRows));
        res.json({
            success: true,
            stats,
            clubs: clubPreview,
            recentAuditLogs: auditRows.map((row) => {
                var _a;
                return (Object.assign(Object.assign({}, row), { clubName: row.clubId == null ? null : (_a = clubMap.get(row.clubId)) !== null && _a !== void 0 ? _a : null }));
            }),
        });
    }
    catch (error) {
        console.error('Super admin dashboard error:', error);
        res.status(500).json({ error: 'Could not load dashboard.' });
    }
}));
router.get('/clubs', (_req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        yield (0, invitationsService_1.syncInvitationStatuses)();
        const [clubRows, userRows, inviteRows] = yield Promise.all([
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
}));
router.post('/clubs', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j;
    try {
        const name = String((_b = (_a = req.body) === null || _a === void 0 ? void 0 : _a.name) !== null && _b !== void 0 ? _b : '').trim();
        if (!name) {
            return res.status(400).json({ error: 'Club name is required.' });
        }
        const normalizedName = name.toLowerCase();
        const existing = yield db_1.db.select().from(schema_1.clubs).where((0, drizzle_orm_1.eq)(schema_1.clubs.normalizedName, normalizedName)).limit(1);
        if (existing[0]) {
            return res.status(409).json({ error: 'Club already exists.' });
        }
        const inserted = yield db_1.db.insert(schema_1.clubs).values({
            name,
            normalizedName,
            createdBy: ((_c = req.user) === null || _c === void 0 ? void 0 : _c.id) == null ? null : String(req.user.id),
        }).returning();
        yield (0, auditService_1.writeAuditLog)({
            action: 'club.created',
            entityType: 'club',
            entityId: inserted[0].id,
            actorUserId: (_e = (_d = req.user) === null || _d === void 0 ? void 0 : _d.id) !== null && _e !== void 0 ? _e : null,
            actorUid: (_g = (_f = req.firebaseUser) === null || _f === void 0 ? void 0 : _f.uid) !== null && _g !== void 0 ? _g : null,
            actorRole: (_j = (_h = req.user) === null || _h === void 0 ? void 0 : _h.role) !== null && _j !== void 0 ? _j : null,
            clubId: inserted[0].id,
            metadata: { name },
        });
        const summary = Object.assign(Object.assign({}, inserted[0]), { status: 'active', usersCount: 0, userCount: 0, adminsCount: 0, adminCount: 0, coachCount: 0, staffCount: 0, playerCount: 0, pendingInviteCount: 0 });
        res.status(201).json({ success: true, club: summary });
    }
    catch (error) {
        console.error('Create club error:', error);
        res.status(500).json({ error: 'Could not create club.' });
    }
}));
router.get('/users', (_req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        yield (0, invitationsService_1.syncInvitationStatuses)();
        const [userRows, clubRows, inviteRows] = yield Promise.all([
            db_1.db.select().from(schema_1.users).orderBy((0, drizzle_orm_1.desc)(schema_1.users.createdAt)),
            db_1.db.select().from(schema_1.clubs),
            db_1.db.select().from(schema_1.invites),
        ]);
        const clubMap = new Map(clubRows.map((club) => [club.id, club.name]));
        const pendingInvites = inviteRows
            .filter((invite) => (0, invitationsService_1.isVisiblePendingInvite)(invite, userRows))
            .map((invite) => {
            var _a;
            return ({
                id: `invite-${invite.id}`,
                email: invite.email,
                name: invite.email.split('@')[0],
                role: invite.role,
                status: invite.status,
                clubId: invite.clubId,
                clubName: invite.clubId == null ? null : (_a = clubMap.get(invite.clubId)) !== null && _a !== void 0 ? _a : null,
                createdAt: invite.createdAt,
                lastLoginAt: null,
                source: 'invite',
            });
        });
        const activeUsers = userRows.map((user) => {
            var _a;
            return (Object.assign(Object.assign({}, user), { status: user.status === 'pending' ? 'pending_registration' : user.status === 'disabled' ? 'inactive' : 'active', clubName: user.clubId == null ? null : (_a = clubMap.get(user.clubId)) !== null && _a !== void 0 ? _a : null, source: 'user' }));
        });
        res.json({ success: true, users: [...pendingInvites, ...activeUsers].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))) });
    }
    catch (error) {
        console.error('List users error:', error);
        res.status(500).json({ error: 'Could not load users.' });
    }
}));
router.patch('/users/:id', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l;
    try {
        const id = Number(req.params.id);
        if (Number.isNaN(id)) {
            return res.status(400).json({ error: 'Invalid user id.' });
        }
        const payload = {};
        if (typeof ((_a = req.body) === null || _a === void 0 ? void 0 : _a.name) === 'string')
            payload.name = req.body.name.trim();
        if (typeof ((_b = req.body) === null || _b === void 0 ? void 0 : _b.role) === 'string')
            payload.role = req.body.role;
        if (typeof ((_c = req.body) === null || _c === void 0 ? void 0 : _c.status) === 'string')
            payload.status = req.body.status;
        if (((_d = req.body) === null || _d === void 0 ? void 0 : _d.clubId) != null)
            payload.clubId = Number(req.body.clubId);
        const updated = yield db_1.db.update(schema_1.users).set(Object.assign(Object.assign(Object.assign(Object.assign(Object.assign({}, (payload.name ? { name: String(payload.name) } : {})), (payload.role ? { role: String(payload.role) } : {})), (payload.status ? { status: String(payload.status) } : {})), (payload.clubId != null ? { clubId: Number(payload.clubId) } : {})), { updatedAt: new Date().toISOString() })).where((0, drizzle_orm_1.eq)(schema_1.users.id, id)).returning();
        if (!updated[0]) {
            return res.status(404).json({ error: 'User not found.' });
        }
        yield (0, auditService_1.writeAuditLog)({
            action: 'user.updated',
            entityType: 'user',
            entityId: id,
            actorUserId: (_f = (_e = req.user) === null || _e === void 0 ? void 0 : _e.id) !== null && _f !== void 0 ? _f : null,
            actorUid: (_h = (_g = req.firebaseUser) === null || _g === void 0 ? void 0 : _g.uid) !== null && _h !== void 0 ? _h : null,
            actorRole: (_k = (_j = req.user) === null || _j === void 0 ? void 0 : _j.role) !== null && _k !== void 0 ? _k : null,
            clubId: (_l = updated[0].clubId) !== null && _l !== void 0 ? _l : null,
            metadata: payload,
        });
        res.json({ success: true, user: updated[0] });
    }
    catch (error) {
        console.error('Update user error:', error);
        res.status(500).json({ error: 'Could not update user.' });
    }
}));
router.post('/users/:id/deactivate', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q;
    try {
        const rawId = String(req.params.id);
        if (rawId.startsWith('invite-')) {
            const inviteId = Number(rawId.slice('invite-'.length));
            if (Number.isNaN(inviteId)) {
                return res.status(400).json({ error: 'Invalid invite id.' });
            }
            const inviteRows = yield db_1.db.select().from(schema_1.invites).where((0, drizzle_orm_1.eq)(schema_1.invites.id, inviteId)).limit(1);
            const invite = inviteRows[0];
            if (!invite) {
                return res.status(404).json({ error: 'Invite not found.' });
            }
            const updatedInvite = yield db_1.db.update(schema_1.invites).set({ status: 'revoked' }).where((0, drizzle_orm_1.eq)(schema_1.invites.id, inviteId)).returning();
            yield (0, auditService_1.writeAuditLog)({
                action: 'invitation.revoked',
                entityType: 'invitation',
                entityId: inviteId,
                actorUserId: (_b = (_a = req.user) === null || _a === void 0 ? void 0 : _a.id) !== null && _b !== void 0 ? _b : null,
                actorUid: (_d = (_c = req.firebaseUser) === null || _c === void 0 ? void 0 : _c.uid) !== null && _d !== void 0 ? _d : null,
                actorRole: (_f = (_e = req.user) === null || _e === void 0 ? void 0 : _e.role) !== null && _f !== void 0 ? _f : null,
                clubId: (_g = invite.clubId) !== null && _g !== void 0 ? _g : null,
                metadata: { email: invite.email, role: invite.role, status: 'revoked' },
            });
            return res.json({ success: true, invitation: (_h = updatedInvite[0]) !== null && _h !== void 0 ? _h : invite });
        }
        const id = Number(rawId);
        if (Number.isNaN(id)) {
            return res.status(400).json({ error: 'Invalid user id.' });
        }
        const updated = yield db_1.db.update(schema_1.users).set({
            status: 'disabled',
            updatedAt: new Date().toISOString(),
        }).where((0, drizzle_orm_1.eq)(schema_1.users.id, id)).returning();
        if (!updated[0]) {
            return res.status(404).json({ error: 'User not found.' });
        }
        yield (0, auditService_1.writeAuditLog)({
            action: 'user.deactivated',
            entityType: 'user',
            entityId: id,
            actorUserId: (_k = (_j = req.user) === null || _j === void 0 ? void 0 : _j.id) !== null && _k !== void 0 ? _k : null,
            actorUid: (_m = (_l = req.firebaseUser) === null || _l === void 0 ? void 0 : _l.uid) !== null && _m !== void 0 ? _m : null,
            actorRole: (_p = (_o = req.user) === null || _o === void 0 ? void 0 : _o.role) !== null && _p !== void 0 ? _p : null,
            clubId: (_q = updated[0].clubId) !== null && _q !== void 0 ? _q : null,
        });
        res.json({ success: true, user: updated[0] });
    }
    catch (error) {
        console.error('Deactivate user error:', error);
        res.status(500).json({ error: 'Could not deactivate user.' });
    }
}));
router.get('/audit-logs', (_req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const rows = yield db_1.db.select().from(schema_1.auditLogs).orderBy((0, drizzle_orm_1.desc)(schema_1.auditLogs.createdAt)).limit(100);
        res.json({ success: true, logs: rows });
    }
    catch (error) {
        console.error('Audit logs error:', error);
        res.status(500).json({ error: 'Could not load audit logs.' });
    }
}));
router.get('/roles', (_req, res) => __awaiter(void 0, void 0, void 0, function* () {
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
}));
router.get('/settings', (_req, res) => {
    var _a, _b, _c, _d;
    res.json({
        success: true,
        settings: {
            inviteTtlHours: (_a = process.env.INVITE_TTL_HOURS) !== null && _a !== void 0 ? _a : '168',
            resendFromEmail: (_b = process.env.RESEND_FROM_EMAIL) !== null && _b !== void 0 ? _b : 'BCMS <no-reply@bcms.ro>',
            appBaseUrl: (_d = (_c = process.env.APP_BASE_URL) !== null && _c !== void 0 ? _c : process.env.FRONTEND_URL) !== null && _d !== void 0 ? _d : 'https://bcms.ro',
        },
    });
});
exports.default = router;
