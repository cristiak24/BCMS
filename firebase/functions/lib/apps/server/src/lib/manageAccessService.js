"use strict";
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
async function ensureClubForUser(user) {
    if (user.clubId != null) {
        const existingClub = await (0, manageAccessRepository_1.getClubById)(user.clubId);
        if (existingClub) {
            return existingClub;
        }
    }
    const defaultClub = await (0, manageAccessRepository_1.ensureDefaultClub)();
    if (!user.isHardcodedAdmin) {
        await (0, manageAccessRepository_1.assignUserClub)(user.id, defaultClub.id);
    }
    return defaultClub;
}
async function listManageAccessRequests(user) {
    const club = await ensureClubForUser(user);
    return (0, manageAccessRepository_1.listClubAccessRequests)(club.id);
}
async function approveManageAccessRequest(user, requestId) {
    const club = await ensureClubForUser(user);
    const request = await (0, manageAccessRepository_1.getAccessRequestById)(requestId, club.id);
    if (!request) {
        throw new Error('Access request not found.');
    }
    if (request.status !== 'pending') {
        throw new Error('Only pending requests can be approved.');
    }
    await (0, manageAccessRepository_1.approveAccessRequest)(request.id, club.id, user.isHardcodedAdmin ? null : user.id);
    await (0, manageAccessRepository_1.updateUserAccess)(request.userId, {
        clubId: club.id,
        role: request.requestedRole,
        status: 'active',
    });
}
async function denyManageAccessRequest(user, requestId) {
    const club = await ensureClubForUser(user);
    const request = await (0, manageAccessRepository_1.getAccessRequestById)(requestId, club.id);
    if (!request) {
        throw new Error('Access request not found.');
    }
    if (request.status !== 'pending') {
        throw new Error('Only pending requests can be denied.');
    }
    await (0, manageAccessRepository_1.denyAccessRequest)(request.id, club.id, user.isHardcodedAdmin ? null : user.id);
    await (0, manageAccessRepository_1.updateUserAccess)(request.userId, {
        clubId: club.id,
        role: request.requestedRole,
        status: 'disabled',
    });
}
function toInviteLinkRecord(params) {
    return {
        id: params.id,
        clubId: params.clubId,
        clubName: params.clubName,
        role: params.role,
        token: params.token,
        expiresAt: (0, firebaseAdmin_1.toIso)(params.expiresAt) ?? new Date().toISOString(),
        refreshIntervalMinutes: params.refreshIntervalMinutes,
        createdAt: (0, firebaseAdmin_1.toIso)(params.createdAt) ?? new Date().toISOString(),
        isActive: params.isActive,
    };
}
async function generateClubInviteLink(user, role, refreshIntervalMinutes) {
    const club = await ensureClubForUser(user);
    const interval = (0, manageAccessTokens_1.normalizeRefreshIntervalMinutes)(refreshIntervalMinutes);
    const token = (0, manageAccessTokens_1.generateInviteToken)(role, interval);
    await (0, manageAccessRepository_1.deactivateActiveInviteLinks)(club.id, role);
    const created = await (0, manageAccessRepository_1.createInviteLink)({
        clubId: club.id,
        role,
        token: token.rawToken,
        tokenHash: token.tokenHash,
        expiresAt: token.expiresAt,
        refreshIntervalMinutes: interval,
        createdBy: user.isHardcodedAdmin ? null : user.id,
    });
    if (!created) {
        throw new Error('Could not persist the invite link.');
    }
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
}
async function getActiveClubInviteLink(user, role) {
    const club = await ensureClubForUser(user);
    const active = await (0, manageAccessRepository_1.getActiveInviteLinkForClubRole)(club.id, role);
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
    if (active) {
        await (0, manageAccessRepository_1.deactivateActiveInviteLinks)(club.id, role);
    }
    return null;
}
async function validateInviteToken(rawToken) {
    const invite = await (0, manageAccessRepository_1.findInviteLinkByTokenHash)((0, manageAccessTokens_1.hashInviteToken)(rawToken));
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
        expiresAt: (0, firebaseAdmin_1.toIso)(invite.expiresAt) ?? new Date().toISOString(),
        refreshIntervalMinutes: invite.refreshIntervalMinutes,
        isExpired: false,
    };
}
async function createPendingAccessRequestForSignup(params) {
    const club = params.clubId ? await (0, manageAccessRepository_1.getClubById)(params.clubId) : null;
    const fallbackClub = club ?? await (0, manageAccessRepository_1.ensureDefaultClub)();
    await (0, manageAccessRepository_1.assignUserClub)(params.userId, fallbackClub.id);
    return (0, manageAccessRepository_1.createAccessRequest)(params.userId, fallbackClub.id, params.role);
}
