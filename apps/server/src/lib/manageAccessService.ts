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
    listClubAccessRequests,
    updateUserAccess,
} from './manageAccessRepository';
import { generateInviteToken, hashInviteToken, isInviteExpired, normalizeRefreshIntervalMinutes } from './manageAccessTokens';
import type { AppUserContext, InviteLinkRecord, InviteRole } from '../types/manageAccess';
import { toIso } from './dateUtils';
import { findClubTeam } from './clubInviteCodes';

export async function ensureClubForUser(user: AppUserContext) {
    if (user.clubId != null) {
        const existingClub = await getClubById(user.clubId);
        if (existingClub) {
            return existingClub;
        }
    }

    const defaultClub = await ensureDefaultClub();

    await assignUserClub(user.id, defaultClub.id);

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

    await approveAccessRequest(request.id, club.id, user.id);
    await updateUserAccess(request.userId, {
        clubId: club.id,
        role: request.requestedRole as InviteRole,
        status: 'active',
    });

    return {
        requestId: request.id,
        clubId: club.id,
        targetUserId: request.userId,
        role: request.requestedRole as InviteRole,
    };
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

    // Denying a request only rejects that request — it must NOT disable the user's
    // account. The user stays in their current (pending) state so the admin can
    // still approve a later request, exactly as the UI copy promises. Disabling an
    // account is a separate, explicit action in Manage Accounts.
    await denyAccessRequest(request.id, club.id, user.id);

    return {
        requestId: request.id,
        clubId: club.id,
        targetUserId: request.userId,
        role: request.requestedRole as InviteRole,
    };
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
    teamId?: number | null;
    teamName?: string | null;
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
        teamId: params.teamId ?? null,
        teamName: params.teamName ?? null,
    };
}

export class InviteTeamError extends Error {}

async function resolveInviteTeam(clubId: number, teamId: number | null | undefined) {
    if (teamId == null) return null;
    const team = await findClubTeam(clubId, teamId);
    if (!team) throw new InviteTeamError('Echipa aleasă nu există în acest club.');
    return team;
}

export async function generateClubInviteLink(user: AppUserContext, role: InviteRole, refreshIntervalMinutes?: number, teamId?: number | null) {
    const club = await ensureClubForUser(user);
    const team = await resolveInviteTeam(club.id, teamId);
    const interval = normalizeRefreshIntervalMinutes(refreshIntervalMinutes);
    const token = generateInviteToken(role, interval);

    await deactivateActiveInviteLinks(club.id, role, team?.id ?? null);

    const created = await createInviteLink({
        clubId: club.id,
        role,
        teamId: team?.id ?? null,
        token: token.rawToken,
        tokenHash: token.tokenHash,
        expiresAt: token.expiresAt,
        refreshIntervalMinutes: interval,
        createdBy: user.id,
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
        teamId: team?.id ?? null,
        teamName: team?.name ?? null,
    });
}

export async function getActiveClubInviteLink(user: AppUserContext, role: InviteRole, teamId?: number | null) {
    const club = await ensureClubForUser(user);
    const team = await resolveInviteTeam(club.id, teamId);
    const active = await getActiveInviteLinkForClubRole(club.id, role, team?.id ?? null);

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
            teamId: team?.id ?? null,
            teamName: team?.name ?? null,
        });
    }

    if (active) {
        await deactivateActiveInviteLinks(club.id, role, team?.id ?? null);
    }

    return null;
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
        teamId: invite.teamName ? invite.teamId : null,
        teamName: invite.teamName,
        isExpired: false,
    };
}

export async function createPendingAccessRequestForSignup(params: { userId: number; clubId?: number | null; role: InviteRole; }) {
    const club = params.clubId ? await getClubById(params.clubId) : null;
    const fallbackClub = club ?? await ensureDefaultClub();
    await assignUserClub(params.userId, fallbackClub.id);
    return createAccessRequest(params.userId, fallbackClub.id, params.role);
}
