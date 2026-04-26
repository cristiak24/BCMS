import {
    approveAccessRequest,
    assignUserClub,
    createAccessRequest,
    createInviteLink,
    deactivateActiveInviteLinks,
    denyAccessRequest,
    ensureDefaultClub,
    findInviteLinkByTokenHash,
    getAccessRequestById,
    getActiveInviteLinkForClubRole,
    getClubById,
    getLatestInviteLinkForClubRole,
    listClubAccessRequests,
    updateUserAccess,
} from './manageAccessRepository';
import { generateInviteToken, hashInviteToken, isInviteExpired, normalizeRefreshIntervalMinutes } from './manageAccessTokens';
import type { AppUserContext, InviteLinkRecord, InviteRole } from '../types/manageAccess';
import { toIso } from './firebaseAdmin';

export async function ensureClubForUser(user: AppUserContext) {
    if (user.clubId != null) {
        const existingClub = await getClubById(user.clubId);
        if (existingClub) {
            return existingClub;
        }
    }

    const defaultClub = await ensureDefaultClub();

    if (!user.isHardcodedAdmin) {
        await assignUserClub(user.id, defaultClub.id);
    }

    return defaultClub;
}

export async function listManageAccessRequests(user: AppUserContext) {
    const club = await ensureClubForUser(user);
    return listClubAccessRequests(club.id);
}

export async function approveManageAccessRequest(user: AppUserContext, requestId: number) {
    const club = await ensureClubForUser(user);
    const request = await getAccessRequestById(requestId, club.id);

    if (!request) {
        throw new Error('Access request not found.');
    }

    if (request.status !== 'pending') {
        throw new Error('Only pending requests can be approved.');
    }

    await approveAccessRequest(request.id, club.id, user.isHardcodedAdmin ? null : user.id);
    await updateUserAccess(request.userId, {
        clubId: club.id,
        role: request.requestedRole as InviteRole,
        status: 'processed',
    });
}

export async function denyManageAccessRequest(user: AppUserContext, requestId: number) {
    const club = await ensureClubForUser(user);
    const request = await getAccessRequestById(requestId, club.id);

    if (!request) {
        throw new Error('Access request not found.');
    }

    if (request.status !== 'pending') {
        throw new Error('Only pending requests can be denied.');
    }

    await denyAccessRequest(request.id, club.id, user.isHardcodedAdmin ? null : user.id);
    await updateUserAccess(request.userId, {
        clubId: club.id,
        role: request.requestedRole as InviteRole,
        status: 'rejected',
    });
}

function toInviteLinkRecord(params: {
    id: number;
    clubId: number;
    clubName: string;
    role: InviteRole;
    token: string;
    expiresAt: unknown;
    refreshIntervalMinutes: number;
    createdAt: unknown;
    isActive: boolean;
}): InviteLinkRecord {
    return {
        id: params.id,
        clubId: params.clubId,
        clubName: params.clubName,
        role: params.role,
        token: params.token,
        expiresAt: toIso(params.expiresAt) ?? new Date().toISOString(),
        refreshIntervalMinutes: params.refreshIntervalMinutes,
        createdAt: toIso(params.createdAt) ?? new Date().toISOString(),
        isActive: params.isActive,
    };
}

export async function generateClubInviteLink(user: AppUserContext, role: InviteRole, refreshIntervalMinutes?: number) {
    const club = await ensureClubForUser(user);
    const interval = normalizeRefreshIntervalMinutes(refreshIntervalMinutes);
    const token = generateInviteToken(role, interval);

    await deactivateActiveInviteLinks(club.id, role);

    const created = await createInviteLink({
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
}

export async function getActiveClubInviteLink(user: AppUserContext, role: InviteRole) {
    const club = await ensureClubForUser(user);
    const active = await getActiveInviteLinkForClubRole(club.id, role);

    if (active && !isInviteExpired(active.expiresAt)) {
        return toInviteLinkRecord({
            id: active.id,
            clubId: club.id,
            clubName: club.name,
            role: active.role as InviteRole,
            token: active.token,
            expiresAt: active.expiresAt,
            refreshIntervalMinutes: active.refreshIntervalMinutes,
            createdAt: active.createdAt,
            isActive: active.isActive === 1,
        });
    }

    const latest = await getLatestInviteLinkForClubRole(club.id, role);
    const interval = latest?.refreshIntervalMinutes ?? 30;
    return generateClubInviteLink(user, role, interval);
}

export async function validateInviteToken(rawToken: string) {
    const invite = await findInviteLinkByTokenHash(hashInviteToken(rawToken));

    if (!invite || !invite.isActive) {
        throw new Error('Invite link is invalid or inactive.');
    }

    if (isInviteExpired(invite.expiresAt)) {
        throw new Error('Invite link has expired.');
    }

    return {
        clubId: invite.clubId,
        clubName: invite.clubName,
        role: invite.role,
        expiresAt: toIso(invite.expiresAt) ?? new Date().toISOString(),
        refreshIntervalMinutes: invite.refreshIntervalMinutes,
        isExpired: false,
    };
}

export async function createPendingAccessRequestForSignup(params: { userId: number; clubId?: number | null; role: InviteRole; }) {
    const club = params.clubId ? await getClubById(params.clubId) : null;
    const fallbackClub = club ?? await ensureDefaultClub();
    await assignUserClub(params.userId, fallbackClub.id);
    return createAccessRequest(params.userId, fallbackClub.id, params.role);
}
