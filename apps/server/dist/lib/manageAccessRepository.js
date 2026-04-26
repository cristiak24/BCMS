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
function findUserDocByNumericId(userId) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a;
        const rows = yield db_1.db.select().from(schema_1.users).where((0, drizzle_orm_1.eq)(schema_1.users.id, userId)).limit(1);
        return (_a = rows[0]) !== null && _a !== void 0 ? _a : null;
    });
}
function getClubById(clubId) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a;
        const rows = yield db_1.db.select().from(schema_1.clubs).where((0, drizzle_orm_1.eq)(schema_1.clubs.id, clubId)).limit(1);
        return (_a = rows[0]) !== null && _a !== void 0 ? _a : null;
    });
}
function ensureDefaultClub() {
    return __awaiter(this, void 0, void 0, function* () {
        var _a;
        const clubRows = yield db_1.db.select().from(schema_1.clubs).limit(1);
        const existingClub = clubRows[0];
        if (existingClub) {
            return existingClub;
        }
        const teamRows = yield db_1.db.select({ name: schema_1.teams.name }).from(schema_1.teams).limit(1);
        const firstTeamName = (_a = teamRows[0]) === null || _a === void 0 ? void 0 : _a.name;
        const club = {
            name: firstTeamName ? `${firstTeamName} Club` : 'Aura Hoops Club',
            createdBy: 'system',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
        };
        const inserted = yield db_1.db.insert(schema_1.clubs).values(club).returning();
        return inserted[0];
    });
}
function assignUserClub(userId, clubId) {
    return __awaiter(this, void 0, void 0, function* () {
        const updated = yield db_1.db.update(schema_1.users)
            .set({ clubId })
            .where((0, drizzle_orm_1.eq)(schema_1.users.id, userId))
            .returning();
        return updated.length > 0 ? updated[0] : null;
    });
}
function createAccessRequest(userId, clubId, requestedRole) {
    return __awaiter(this, void 0, void 0, function* () {
        const user = yield findUserDocByNumericId(userId);
        const request = {
            userId,
            clubId,
            userName: user === null || user === void 0 ? void 0 : user.name,
            userEmail: user === null || user === void 0 ? void 0 : user.email,
            requestedRole: requestedRole,
            status: 'pending',
            createdAt: new Date().toISOString(),
        };
        const inserted = yield db_1.db.insert(schema_1.accessRequests).values(request).returning();
        return inserted[0];
    });
}
function listClubAccessRequests(clubId) {
    return __awaiter(this, void 0, void 0, function* () {
        const rows = yield db_1.db.select().from(schema_1.accessRequests)
            .where((0, drizzle_orm_1.eq)(schema_1.accessRequests.clubId, clubId))
            .orderBy((0, drizzle_orm_1.desc)(schema_1.accessRequests.createdAt));
        return rows.map((row) => {
            var _a, _b, _c, _d, _e;
            return ({
                id: row.id,
                userId: row.userId,
                clubId: row.clubId,
                userName: (_a = row.userName) !== null && _a !== void 0 ? _a : '',
                userEmail: (_b = row.userEmail) !== null && _b !== void 0 ? _b : '',
                requestedRole: row.requestedRole,
                status: row.status,
                createdAt: (_c = row.createdAt) !== null && _c !== void 0 ? _c : new Date(0).toISOString(),
                reviewedAt: (_d = row.reviewedAt) !== null && _d !== void 0 ? _d : null,
                reviewedBy: (_e = row.reviewedBy) !== null && _e !== void 0 ? _e : null,
            });
        });
    });
}
function getAccessRequestById(id, clubId) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a;
        const rows = yield db_1.db.select().from(schema_1.accessRequests)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.accessRequests.id, id), (0, drizzle_orm_1.eq)(schema_1.accessRequests.clubId, clubId)))
            .limit(1);
        return (_a = rows[0]) !== null && _a !== void 0 ? _a : null;
    });
}
function approveAccessRequest(id, clubId, reviewedBy) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a;
        const updated = yield db_1.db.update(schema_1.accessRequests)
            .set({
            status: 'approved',
            reviewedAt: new Date().toISOString(),
            reviewedBy,
        })
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.accessRequests.id, id), (0, drizzle_orm_1.eq)(schema_1.accessRequests.clubId, clubId)))
            .returning();
        return (_a = updated[0]) !== null && _a !== void 0 ? _a : null;
    });
}
function denyAccessRequest(id, clubId, reviewedBy) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a;
        const updated = yield db_1.db.update(schema_1.accessRequests)
            .set({
            status: 'denied',
            reviewedAt: new Date().toISOString(),
            reviewedBy,
        })
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.accessRequests.id, id), (0, drizzle_orm_1.eq)(schema_1.accessRequests.clubId, clubId)))
            .returning();
        return (_a = updated[0]) !== null && _a !== void 0 ? _a : null;
    });
}
function updateUserAccess(userId, payload) {
    return __awaiter(this, void 0, void 0, function* () {
        const updated = yield db_1.db.update(schema_1.users)
            .set({
            clubId: payload.clubId,
            role: payload.role,
            status: payload.status,
        })
            .where((0, drizzle_orm_1.eq)(schema_1.users.id, userId))
            .returning();
        return updated.length > 0 ? updated[0] : null;
    });
}
function deactivateActiveInviteLinks(clubId, role) {
    return __awaiter(this, void 0, void 0, function* () {
        yield db_1.db.update(schema_1.inviteLinks)
            .set({ isActive: 0 })
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.inviteLinks.clubId, clubId), (0, drizzle_orm_1.eq)(schema_1.inviteLinks.role, role), (0, drizzle_orm_1.eq)(schema_1.inviteLinks.isActive, 1)));
    });
}
function createInviteLink(payload) {
    return __awaiter(this, void 0, void 0, function* () {
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
        const inserted = yield db_1.db.insert(schema_1.inviteLinks).values(record).returning();
        return inserted[0];
    });
}
function getLatestInviteLinkForClubRole(clubId, role) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a;
        const rows = yield db_1.db.select().from(schema_1.inviteLinks)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.inviteLinks.clubId, clubId), (0, drizzle_orm_1.eq)(schema_1.inviteLinks.role, role)))
            .orderBy((0, drizzle_orm_1.desc)(schema_1.inviteLinks.createdAt))
            .limit(1);
        return (_a = rows[0]) !== null && _a !== void 0 ? _a : null;
    });
}
function getActiveInviteLinkForClubRole(clubId, role) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a;
        const rows = yield db_1.db.select().from(schema_1.inviteLinks)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.inviteLinks.clubId, clubId), (0, drizzle_orm_1.eq)(schema_1.inviteLinks.role, role), (0, drizzle_orm_1.eq)(schema_1.inviteLinks.isActive, 1)))
            .orderBy((0, drizzle_orm_1.desc)(schema_1.inviteLinks.createdAt))
            .limit(1);
        return (_a = rows[0]) !== null && _a !== void 0 ? _a : null;
    });
}
function findInviteLinkByTokenHash(tokenHash) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a;
        const rows = yield db_1.db.select().from(schema_1.inviteLinks)
            .where((0, drizzle_orm_1.eq)(schema_1.inviteLinks.tokenHash, tokenHash))
            .limit(1);
        const invite = rows[0];
        if (!invite) {
            return null;
        }
        const club = yield getClubById(invite.clubId);
        return Object.assign(Object.assign({}, invite), { clubName: (_a = club === null || club === void 0 ? void 0 : club.name) !== null && _a !== void 0 ? _a : null });
    });
}
