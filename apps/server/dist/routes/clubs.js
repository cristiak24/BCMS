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
const db_1 = require("../db");
const schema_1 = require("../db/schema");
const auth_1 = require("../middleware/auth");
const auditService_1 = require("../services/auditService");
const invitationsService_1 = require("../services/invitationsService");
const router = (0, express_1.Router)();
function toClubSummary(club, userRows, inviteRows) {
    const clubUsers = userRows.filter((user) => user.clubId === club.id);
    const now = new Date();
    return Object.assign(Object.assign({}, club), { status: 'active', usersCount: clubUsers.length, userCount: clubUsers.length, adminsCount: clubUsers.filter((user) => user.role === 'admin').length, adminCount: clubUsers.filter((user) => user.role === 'admin').length, coachCount: clubUsers.filter((user) => user.role === 'coach').length, staffCount: clubUsers.filter((user) => user.role === 'staff' || user.role === 'accountant').length, playerCount: clubUsers.filter((user) => user.role === 'player').length, pendingInviteCount: inviteRows.filter((invite) => invite.clubId === club.id && (0, invitationsService_1.isVisiblePendingInvite)(invite, userRows, now)).length });
}
router.use(auth_1.authenticate, auth_1.requireSuperadmin);
router.get('/', (_req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        yield (0, invitationsService_1.syncInvitationStatuses)();
        const [clubRows, userRows, inviteRows] = yield Promise.all([
            db_1.db.select().from(schema_1.clubs).orderBy((0, drizzle_orm_1.desc)(schema_1.clubs.updatedAt)),
            db_1.db.select().from(schema_1.users),
            db_1.db.select().from(schema_1.invites),
        ]);
        res.json({
            success: true,
            clubs: clubRows.map((club) => toClubSummary(club, userRows, inviteRows)),
        });
    }
    catch (error) {
        console.error('List clubs error:', error);
        res.status(500).json({ error: 'Could not load clubs.' });
    }
}));
router.post('/', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j;
    try {
        const name = String((_b = (_a = req.body) === null || _a === void 0 ? void 0 : _a.name) !== null && _b !== void 0 ? _b : '').trim().replace(/\s+/g, ' ');
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
        const club = inserted[0];
        yield (0, auditService_1.writeAuditLog)({
            action: 'club.created',
            entityType: 'club',
            entityId: club.id,
            actorUserId: (_e = (_d = req.user) === null || _d === void 0 ? void 0 : _d.id) !== null && _e !== void 0 ? _e : null,
            actorUid: (_g = (_f = req.firebaseUser) === null || _f === void 0 ? void 0 : _f.uid) !== null && _g !== void 0 ? _g : null,
            actorRole: (_j = (_h = req.user) === null || _h === void 0 ? void 0 : _h.role) !== null && _j !== void 0 ? _j : null,
            clubId: club.id,
            metadata: { name },
        });
        res.status(201).json({
            success: true,
            club: toClubSummary(club, [], []),
        });
    }
    catch (error) {
        console.error('Create club error:', error);
        res.status(500).json({ error: 'Could not create club.' });
    }
}));
exports.default = router;
