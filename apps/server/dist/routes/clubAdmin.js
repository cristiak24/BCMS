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
const invitationsService_1 = require("../services/invitationsService");
const auditService_1 = require("../services/auditService");
const router = (0, express_1.Router)();
function normalizeClubAdminInviteRole(value) {
    return value === 'coach' || value === 'player' ? value : null;
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
router.get('/accounts', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    const actor = ensureClubAdmin(req, res);
    if (!actor) {
        return;
    }
    try {
        yield (0, invitationsService_1.syncInvitationStatuses)();
        const [clubRows, userRows, inviteRows] = yield Promise.all([
            db_1.db.select({ id: schema_1.clubs.id, name: schema_1.clubs.name }).from(schema_1.clubs).where((0, drizzle_orm_1.eq)(schema_1.clubs.id, actor.clubId)).limit(1),
            db_1.db.select().from(schema_1.users).where((0, drizzle_orm_1.eq)(schema_1.users.clubId, actor.clubId)).orderBy((0, drizzle_orm_1.desc)(schema_1.users.createdAt)),
            db_1.db.select().from(schema_1.invites).where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.invites.clubId, actor.clubId), (0, drizzle_orm_1.eq)(schema_1.invites.status, 'pending'))).orderBy((0, drizzle_orm_1.desc)(schema_1.invites.createdAt)),
        ]);
        const clubName = (_b = (_a = clubRows[0]) === null || _a === void 0 ? void 0 : _a.name) !== null && _b !== void 0 ? _b : null;
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
        const activeUsers = userRows.map((user) => (Object.assign(Object.assign({}, user), { status: user.status === 'pending' ? 'pending_registration' : user.status === 'disabled' ? 'inactive' : 'active', clubName, source: 'user' })));
        res.json({
            success: true,
            users: [...pendingInvites, ...activeUsers].sort((a, b) => { var _a, _b; return String((_a = b.createdAt) !== null && _a !== void 0 ? _a : '').localeCompare(String((_b = a.createdAt) !== null && _b !== void 0 ? _b : '')); }),
        });
    }
    catch (error) {
        console.error('Club admin accounts error:', error);
        res.status(500).json({ error: 'Could not load club accounts.' });
    }
}));
router.post('/accounts/invitations', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c, _d, _e, _f;
    const actor = ensureClubAdmin(req, res);
    if (!actor) {
        return;
    }
    const role = normalizeClubAdminInviteRole((_a = req.body) === null || _a === void 0 ? void 0 : _a.role);
    if (!role) {
        return res.status(400).json({ error: 'Only coach and player roles can be invited from club admin.' });
    }
    try {
        const result = yield (0, invitationsService_1.createSuperAdminInvitation)({
            email: String((_c = (_b = req.body) === null || _b === void 0 ? void 0 : _b.email) !== null && _c !== void 0 ? _c : ''),
            fullName: String((_e = (_d = req.body) === null || _d === void 0 ? void 0 : _d.fullName) !== null && _e !== void 0 ? _e : ''),
            role,
            clubId: actor.clubId,
        }, {
            user: req.user,
            firebaseUser: req.firebaseUser,
            ip: req.ip,
            userAgent: (_f = req.get('user-agent')) !== null && _f !== void 0 ? _f : undefined,
        });
        res.status(201).json({ success: true, invitation: result });
    }
    catch (error) {
        console.error('Club admin create invitation error:', error);
        const message = error instanceof Error ? error.message : 'Could not create invitation.';
        res.status(400).json({ error: message });
    }
}));
router.patch('/accounts/:id', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c, _d, _e, _f, _g;
    const actor = ensureClubAdmin(req, res);
    if (!actor) {
        return;
    }
    const id = Number(req.params.id);
    const nextRole = normalizeClubAdminInviteRole((_a = req.body) === null || _a === void 0 ? void 0 : _a.role);
    if (Number.isNaN(id)) {
        return res.status(400).json({ error: 'Invalid user id.' });
    }
    if (!nextRole) {
        return res.status(400).json({ error: 'Only coach and player roles can be assigned from club admin.' });
    }
    try {
        const currentRows = yield db_1.db
            .select()
            .from(schema_1.users)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.users.id, id), (0, drizzle_orm_1.eq)(schema_1.users.clubId, actor.clubId)))
            .limit(1);
        const currentUser = currentRows[0];
        if (!currentUser) {
            return res.status(404).json({ error: 'User not found in your club.' });
        }
        const updated = yield db_1.db.update(schema_1.users).set({
            role: nextRole,
            updatedAt: new Date().toISOString(),
        }).where((0, drizzle_orm_1.eq)(schema_1.users.id, id)).returning();
        yield (0, auditService_1.writeAuditLog)({
            action: 'club_admin.user_role_updated',
            entityType: 'user',
            entityId: id,
            actorUserId: (_c = (_b = req.user) === null || _b === void 0 ? void 0 : _b.id) !== null && _c !== void 0 ? _c : null,
            actorUid: (_e = (_d = req.firebaseUser) === null || _d === void 0 ? void 0 : _d.uid) !== null && _e !== void 0 ? _e : null,
            actorRole: (_g = (_f = req.user) === null || _f === void 0 ? void 0 : _f.role) !== null && _g !== void 0 ? _g : null,
            clubId: actor.clubId,
            metadata: { previousRole: currentUser.role, nextRole },
        });
        res.json({ success: true, user: updated[0] });
    }
    catch (error) {
        console.error('Club admin update user error:', error);
        res.status(500).json({ error: 'Could not update user role.' });
    }
}));
router.post('/accounts/:id/deactivate', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p;
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
            const inviteRows = yield db_1.db
                .select()
                .from(schema_1.invites)
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.invites.id, inviteId), (0, drizzle_orm_1.eq)(schema_1.invites.clubId, actor.clubId)))
                .limit(1);
            const invite = inviteRows[0];
            if (!invite) {
                return res.status(404).json({ error: 'Invite not found in your club.' });
            }
            const updatedInvite = yield db_1.db.update(schema_1.invites).set({ status: 'revoked' }).where((0, drizzle_orm_1.eq)(schema_1.invites.id, inviteId)).returning();
            yield (0, auditService_1.writeAuditLog)({
                action: 'club_admin.invitation_revoked',
                entityType: 'invitation',
                entityId: inviteId,
                actorUserId: (_b = (_a = req.user) === null || _a === void 0 ? void 0 : _a.id) !== null && _b !== void 0 ? _b : null,
                actorUid: (_d = (_c = req.firebaseUser) === null || _c === void 0 ? void 0 : _c.uid) !== null && _d !== void 0 ? _d : null,
                actorRole: (_f = (_e = req.user) === null || _e === void 0 ? void 0 : _e.role) !== null && _f !== void 0 ? _f : null,
                clubId: actor.clubId,
                metadata: { email: invite.email, role: invite.role },
            });
            return res.json({ success: true, invitation: (_g = updatedInvite[0]) !== null && _g !== void 0 ? _g : invite });
        }
        const id = Number(rawId);
        if (Number.isNaN(id)) {
            return res.status(400).json({ error: 'Invalid user id.' });
        }
        if (((_h = req.user) === null || _h === void 0 ? void 0 : _h.id) === id) {
            return res.status(400).json({ error: 'You cannot deactivate your own account from this screen.' });
        }
        const userRows = yield db_1.db
            .select()
            .from(schema_1.users)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.users.id, id), (0, drizzle_orm_1.eq)(schema_1.users.clubId, actor.clubId)))
            .limit(1);
        const targetUser = userRows[0];
        if (!targetUser) {
            return res.status(404).json({ error: 'User not found in your club.' });
        }
        const updated = yield db_1.db.update(schema_1.users).set({
            status: 'disabled',
            updatedAt: new Date().toISOString(),
        }).where((0, drizzle_orm_1.eq)(schema_1.users.id, id)).returning();
        yield (0, auditService_1.writeAuditLog)({
            action: 'club_admin.user_deactivated',
            entityType: 'user',
            entityId: id,
            actorUserId: (_k = (_j = req.user) === null || _j === void 0 ? void 0 : _j.id) !== null && _k !== void 0 ? _k : null,
            actorUid: (_m = (_l = req.firebaseUser) === null || _l === void 0 ? void 0 : _l.uid) !== null && _m !== void 0 ? _m : null,
            actorRole: (_p = (_o = req.user) === null || _o === void 0 ? void 0 : _o.role) !== null && _p !== void 0 ? _p : null,
            clubId: actor.clubId,
            metadata: { email: targetUser.email, role: targetUser.role },
        });
        res.json({ success: true, user: updated[0] });
    }
    catch (error) {
        console.error('Club admin deactivate account error:', error);
        res.status(500).json({ error: 'Could not update this account.' });
    }
}));
exports.default = router;
