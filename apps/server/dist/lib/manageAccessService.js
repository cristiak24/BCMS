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
exports.ensureClubForUser = ensureClubForUser;
exports.listManageAccessRequests = listManageAccessRequests;
exports.approveManageAccessRequest = approveManageAccessRequest;
exports.denyManageAccessRequest = denyManageAccessRequest;
exports.generateClubInviteLink = generateClubInviteLink;
exports.getActiveClubInviteLink = getActiveClubInviteLink;
exports.validateInviteToken = validateInviteToken;
exports.createPendingAccessRequestForSignup = createPendingAccessRequestForSignup;
const manageAccessRepository_1 = require("./manageAccessRepository");
const manageAccessTokens_1 = require("./manageAccessTokens");
const firebaseAdmin_1 = require("./firebaseAdmin");
function ensureClubForUser(user) {
    return __awaiter(this, void 0, void 0, function* () {
        if (user.clubId != null) {
            const existingClub = yield (0, manageAccessRepository_1.getClubById)(user.clubId);
            if (existingClub) {
                return existingClub;
            }
        }
        const defaultClub = yield (0, manageAccessRepository_1.ensureDefaultClub)();
        if (!user.isHardcodedAdmin) {
            yield (0, manageAccessRepository_1.assignUserClub)(user.id, defaultClub.id);
        }
        return defaultClub;
    });
}
function listManageAccessRequests(user) {
    return __awaiter(this, void 0, void 0, function* () {
        const club = yield ensureClubForUser(user);
        return (0, manageAccessRepository_1.listClubAccessRequests)(club.id);
    });
}
function approveManageAccessRequest(user, requestId) {
    return __awaiter(this, void 0, void 0, function* () {
        const club = yield ensureClubForUser(user);
        const request = yield (0, manageAccessRepository_1.getAccessRequestById)(requestId, club.id);
        if (!request) {
            throw new Error('Access request not found.');
        }
        if (request.status !== 'pending') {
            throw new Error('Only pending requests can be approved.');
        }
        yield (0, manageAccessRepository_1.approveAccessRequest)(request.id, club.id, user.isHardcodedAdmin ? null : user.id);
        yield (0, manageAccessRepository_1.updateUserAccess)(request.userId, {
            clubId: club.id,
            role: request.requestedRole,
            status: 'processed',
        });
    });
}
function denyManageAccessRequest(user, requestId) {
    return __awaiter(this, void 0, void 0, function* () {
        const club = yield ensureClubForUser(user);
        const request = yield (0, manageAccessRepository_1.getAccessRequestById)(requestId, club.id);
        if (!request) {
            throw new Error('Access request not found.');
        }
        if (request.status !== 'pending') {
            throw new Error('Only pending requests can be denied.');
        }
        yield (0, manageAccessRepository_1.denyAccessRequest)(request.id, club.id, user.isHardcodedAdmin ? null : user.id);
        yield (0, manageAccessRepository_1.updateUserAccess)(request.userId, {
            clubId: club.id,
            role: request.requestedRole,
            status: 'rejected',
        });
    });
}
function toInviteLinkRecord(params) {
    var _a, _b;
    return {
        id: params.id,
        clubId: params.clubId,
        clubName: params.clubName,
        role: params.role,
        token: params.token,
        expiresAt: (_a = (0, firebaseAdmin_1.toIso)(params.expiresAt)) !== null && _a !== void 0 ? _a : new Date().toISOString(),
        refreshIntervalMinutes: params.refreshIntervalMinutes,
        createdAt: (_b = (0, firebaseAdmin_1.toIso)(params.createdAt)) !== null && _b !== void 0 ? _b : new Date().toISOString(),
        isActive: params.isActive,
    };
}
function generateClubInviteLink(user, role, refreshIntervalMinutes) {
    return __awaiter(this, void 0, void 0, function* () {
        const club = yield ensureClubForUser(user);
        const interval = (0, manageAccessTokens_1.normalizeRefreshIntervalMinutes)(refreshIntervalMinutes);
        const token = (0, manageAccessTokens_1.generateInviteToken)(role, interval);
        yield (0, manageAccessRepository_1.deactivateActiveInviteLinks)(club.id, role);
        const created = yield (0, manageAccessRepository_1.createInviteLink)({
            clubId: club.id,
            role,
            token: token.rawToken,
            tokenHash: token.tokenHash,
            expiresAt: token.expiresAt,
            refreshIntervalMinutes: interval,
            createdBy: user.isHardcodedAdmin ? null : user.id,
        });
        return toInviteLinkRecord({
            id: created.id,
            clubId: club.id,
            clubName: club.name,
            role,
            token: token.rawToken,
            expiresAt: created.expiresAt,
            refreshIntervalMinutes: created.refreshIntervalMinutes,
            createdAt: created.createdAt,
            isActive: created.isActive === 1,
        });
    });
}
function getActiveClubInviteLink(user, role) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a;
        const club = yield ensureClubForUser(user);
        const active = yield (0, manageAccessRepository_1.getActiveInviteLinkForClubRole)(club.id, role);
        if (active && !(0, manageAccessTokens_1.isInviteExpired)(active.expiresAt)) {
            return toInviteLinkRecord({
                id: active.id,
                clubId: club.id,
                clubName: club.name,
                role: active.role,
                token: active.token,
                expiresAt: active.expiresAt,
                refreshIntervalMinutes: active.refreshIntervalMinutes,
                createdAt: active.createdAt,
                isActive: active.isActive === 1,
            });
        }
        const latest = yield (0, manageAccessRepository_1.getLatestInviteLinkForClubRole)(club.id, role);
        const interval = (_a = latest === null || latest === void 0 ? void 0 : latest.refreshIntervalMinutes) !== null && _a !== void 0 ? _a : 30;
        return generateClubInviteLink(user, role, interval);
    });
}
function validateInviteToken(rawToken) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a;
        const invite = yield (0, manageAccessRepository_1.findInviteLinkByTokenHash)((0, manageAccessTokens_1.hashInviteToken)(rawToken));
        if (!invite || !invite.isActive) {
            throw new Error('Invite link is invalid or inactive.');
        }
        if ((0, manageAccessTokens_1.isInviteExpired)(invite.expiresAt)) {
            throw new Error('Invite link has expired.');
        }
        return {
            clubId: invite.clubId,
            clubName: invite.clubName,
            role: invite.role,
            expiresAt: (_a = (0, firebaseAdmin_1.toIso)(invite.expiresAt)) !== null && _a !== void 0 ? _a : new Date().toISOString(),
            refreshIntervalMinutes: invite.refreshIntervalMinutes,
            isExpired: false,
        };
    });
}
function createPendingAccessRequestForSignup(params) {
    return __awaiter(this, void 0, void 0, function* () {
        const club = params.clubId ? yield (0, manageAccessRepository_1.getClubById)(params.clubId) : null;
        const fallbackClub = club !== null && club !== void 0 ? club : yield (0, manageAccessRepository_1.ensureDefaultClub)();
        yield (0, manageAccessRepository_1.assignUserClub)(params.userId, fallbackClub.id);
        return (0, manageAccessRepository_1.createAccessRequest)(params.userId, fallbackClub.id, params.role);
    });
}
