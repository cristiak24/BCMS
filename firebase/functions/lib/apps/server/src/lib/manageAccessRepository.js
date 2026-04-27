"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getClubById = getClubById;
exports.ensureDefaultClub = ensureDefaultClub;
exports.assignUserClub = assignUserClub;
exports.createAccessRequest = createAccessRequest;
exports.listClubAccessRequests = listClubAccessRequests;
exports.getAccessRequestById = getAccessRequestById;
exports.approveAccessRequest = approveAccessRequest;
exports.denyAccessRequest = denyAccessRequest;
exports.updateUserAccess = updateUserAccess;
exports.deactivateActiveInviteLinks = deactivateActiveInviteLinks;
exports.createInviteLink = createInviteLink;
exports.getLatestInviteLinkForClubRole = getLatestInviteLinkForClubRole;
exports.getActiveInviteLinkForClubRole = getActiveInviteLinkForClubRole;
exports.findInviteLinkByTokenHash = findInviteLinkByTokenHash;
const db_1 = require("../db");
const schema_1 = require("../db/schema");
const drizzle_orm_1 = require("drizzle-orm");
async function findUserDocByNumericId(userId) {
    const rows = await db_1.db.select().from(schema_1.users).where((0, drizzle_orm_1.eq)(schema_1.users.id, userId)).limit(1);
    return rows[0] ?? null;
}
async function getClubById(clubId) {
    const rows = await db_1.db.select().from(schema_1.clubs).where((0, drizzle_orm_1.eq)(schema_1.clubs.id, clubId)).limit(1);
    return rows[0] ?? null;
}
async function ensureDefaultClub() {
    const clubRows = await db_1.db.select().from(schema_1.clubs).limit(1);
    const existingClub = clubRows[0];
    if (existingClub) {
        return existingClub;
    }
    const teamRows = await db_1.db.select({ name: schema_1.teams.name }).from(schema_1.teams).limit(1);
    const firstTeamName = teamRows[0]?.name;
    const club = {
        name: firstTeamName ? `${firstTeamName} Club` : 'Aura Hoops Club',
        createdBy: 'system',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
    };
    const inserted = await db_1.db.insert(schema_1.clubs).values(club).returning();
    return inserted[0];
}
async function assignUserClub(userId, clubId) {
    const updated = await db_1.db.update(schema_1.users)
        .set({ clubId })
        .where((0, drizzle_orm_1.eq)(schema_1.users.id, userId))
        .returning();
    return updated.length > 0 ? updated[0] : null;
}
async function createAccessRequest(userId, clubId, requestedRole) {
    const user = await findUserDocByNumericId(userId);
    const request = {
        userId,
        clubId,
        userName: user?.name,
        userEmail: user?.email,
        requestedRole: requestedRole,
        status: 'pending',
        createdAt: new Date().toISOString(),
    };
    const inserted = await db_1.db.insert(schema_1.accessRequests).values(request).returning();
    return inserted[0];
}
async function listClubAccessRequests(clubId) {
    const rows = await db_1.db.select().from(schema_1.accessRequests)
        .where((0, drizzle_orm_1.eq)(schema_1.accessRequests.clubId, clubId))
        .orderBy((0, drizzle_orm_1.desc)(schema_1.accessRequests.createdAt));
    return rows.map((row) => ({
        id: row.id,
        userId: row.userId,
        clubId: row.clubId,
        userName: row.userName ?? '',
        userEmail: row.userEmail ?? '',
        requestedRole: row.requestedRole,
        status: row.status,
        createdAt: row.createdAt ?? new Date(0).toISOString(),
        reviewedAt: row.reviewedAt ?? null,
        reviewedBy: row.reviewedBy ?? null,
    }));
}
async function getAccessRequestById(id, clubId) {
    const rows = await db_1.db.select().from(schema_1.accessRequests)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.accessRequests.id, id), (0, drizzle_orm_1.eq)(schema_1.accessRequests.clubId, clubId)))
        .limit(1);
    return rows[0] ?? null;
}
async function approveAccessRequest(id, clubId, reviewedBy) {
    const updated = await db_1.db.update(schema_1.accessRequests)
        .set({
        status: 'approved',
        reviewedAt: new Date().toISOString(),
        reviewedBy,
    })
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.accessRequests.id, id), (0, drizzle_orm_1.eq)(schema_1.accessRequests.clubId, clubId)))
        .returning();
    return updated[0] ?? null;
}
async function denyAccessRequest(id, clubId, reviewedBy) {
    const updated = await db_1.db.update(schema_1.accessRequests)
        .set({
        status: 'denied',
        reviewedAt: new Date().toISOString(),
        reviewedBy,
    })
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.accessRequests.id, id), (0, drizzle_orm_1.eq)(schema_1.accessRequests.clubId, clubId)))
        .returning();
    return updated[0] ?? null;
}
async function updateUserAccess(userId, payload) {
    const updated = await db_1.db.update(schema_1.users)
        .set({
        clubId: payload.clubId,
        role: payload.role,
        status: payload.status,
    })
        .where((0, drizzle_orm_1.eq)(schema_1.users.id, userId))
        .returning();
    return updated.length > 0 ? updated[0] : null;
}
async function deactivateActiveInviteLinks(clubId, role) {
    await db_1.db.update(schema_1.inviteLinks)
        .set({ isActive: 0 })
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.inviteLinks.clubId, clubId), (0, drizzle_orm_1.eq)(schema_1.inviteLinks.role, role), (0, drizzle_orm_1.eq)(schema_1.inviteLinks.isActive, 1)));
}
async function createInviteLink(payload) {
    const record = {
        clubId: payload.clubId,
        role: payload.role,
        token: payload.token,
        tokenHash: payload.tokenHash,
        expiresAt: payload.expiresAt.toISOString(),
        refreshIntervalMinutes: payload.refreshIntervalMinutes,
        createdBy: payload.createdBy,
        createdAt: new Date().toISOString(),
        isActive: 1,
    };
    const inserted = await db_1.db.insert(schema_1.inviteLinks).values(record).returning();
    return inserted[0];
}
async function getLatestInviteLinkForClubRole(clubId, role) {
    const rows = await db_1.db.select().from(schema_1.inviteLinks)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.inviteLinks.clubId, clubId), (0, drizzle_orm_1.eq)(schema_1.inviteLinks.role, role)))
        .orderBy((0, drizzle_orm_1.desc)(schema_1.inviteLinks.createdAt))
        .limit(1);
    return rows[0] ?? null;
}
async function getActiveInviteLinkForClubRole(clubId, role) {
    const rows = await db_1.db.select().from(schema_1.inviteLinks)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.inviteLinks.clubId, clubId), (0, drizzle_orm_1.eq)(schema_1.inviteLinks.role, role), (0, drizzle_orm_1.eq)(schema_1.inviteLinks.isActive, 1)))
        .orderBy((0, drizzle_orm_1.desc)(schema_1.inviteLinks.createdAt))
        .limit(1);
    return rows[0] ?? null;
}
async function findInviteLinkByTokenHash(tokenHash) {
    const rows = await db_1.db.select().from(schema_1.inviteLinks)
        .where((0, drizzle_orm_1.eq)(schema_1.inviteLinks.tokenHash, tokenHash))
        .limit(1);
    const invite = rows[0];
    if (!invite) {
        return null;
    }
    const club = await getClubById(invite.clubId);
    return {
        ...invite,
        clubName: club?.name ?? null,
    };
}
