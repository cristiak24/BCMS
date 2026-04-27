"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const drizzle_orm_1 = require("drizzle-orm");
const db_1 = require("../db");
const schema_1 = require("../db/schema");
const auth_1 = require("../middleware/auth");
const auditService_1 = require("../services/auditService");
const router = (0, express_1.Router)();
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
router.get('/', async (_req, res) => {
    try {
        const [clubRows, userRows, inviteRows] = await Promise.all([
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
});
router.post('/', async (req, res) => {
    try {
        const name = String(req.body?.name ?? '').trim().replace(/\s+/g, ' ');
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
        const club = inserted[0];
        await (0, auditService_1.writeAuditLog)({
            action: 'club.created',
            entityType: 'club',
            entityId: club.id,
            actorUserId: req.user?.id ?? null,
            actorUid: req.firebaseUser?.uid ?? null,
            actorRole: req.user?.role ?? null,
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
});
exports.default = router;
