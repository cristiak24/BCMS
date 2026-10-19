import { toIso } from './dateUtils';
import { db } from '../db';
import { users, clubs, teams, accessRequests, inviteLinks, players, playersToTeams } from '../db/schema';
import { eq, and, asc, desc, isNull, sql } from 'drizzle-orm';
import type { AccessRequestRecord, InviteRole } from '../types/manageAccess';
import { decryptInviteToken, encryptInviteToken } from './manageAccessTokens';
import { splitDisplayName } from './password';

type InviteLinkRow = {
    id: number;
    clubId: number;
    role: string;
    token: string;
    tokenHash: string;
    expiresAt: string;
    refreshIntervalMinutes: number;
    createdBy: number | null;
    createdAt: string;
    isActive: number;
    teamId: number | null;
};

/** Return the row with its `token` decrypted back to the raw invite token. */
function withDecryptedToken<T extends { token: string }>(row: T | undefined | null): T | null {
    if (!row) {
        return null;
    }
    return { ...row, token: decryptInviteToken(row.token) };
}

type UserDoc = {
    id: number;
    email: string;
    name: string;
    role: string;
    clubId?: number | null;
    status?: string;
};

function inviteLinkSelection() {
    return {
        id: inviteLinks.id,
        clubId: inviteLinks.clubId,
        role: inviteLinks.role,
        token: inviteLinks.token,
        tokenHash: inviteLinks.tokenHash,
        expiresAt: sql<string>`${inviteLinks.expiresAt} AT TIME ZONE 'UTC'`.as('expires_at'),
        refreshIntervalMinutes: inviteLinks.refreshIntervalMinutes,
        createdBy: inviteLinks.createdBy,
        createdAt: sql<string>`${inviteLinks.createdAt} AT TIME ZONE 'UTC'`.as('created_at'),
        isActive: inviteLinks.isActive,
        teamId: inviteLinks.teamId,
    };
}

export async function getClubById(clubId: number) {
    const rows = await db.select().from(clubs).where(eq(clubs.id, clubId)).limit(1);
    return rows[0] ?? null;
}

export async function ensureDefaultClub() {
    const clubRows = await db.select().from(clubs).limit(1);
    const existingClub = clubRows[0];

    if (existingClub) {
        return existingClub;
    }

    const teamRows = await db.select({ name: teams.name }).from(teams).limit(1);
    const firstTeamName = teamRows[0]?.name;

    const club = {
        name: firstTeamName ? `${firstTeamName} Club` : 'Aura Hoops Club',
        createdBy: 'system',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
    };

    const inserted = await db.insert(clubs).values(club).returning();
    return inserted[0];
}

export async function assignUserClub(userId: number, clubId: number) {
    const updated = await db.update(users)
        .set({ clubId })
        .where(eq(users.id, userId))
        .returning();
    
    return updated.length > 0 ? (updated[0] as unknown as UserDoc) : null;
}

export async function listClubAccessRequests(clubId: number) {
    const rows = await db.select().from(accessRequests)
        .where(eq(accessRequests.clubId, clubId))
        .orderBy(desc(accessRequests.createdAt));
        
    return rows.map<AccessRequestRecord>((row) => ({
        id: row.id,
        userId: row.userId,
        clubId: row.clubId,
        userName: row.userName ?? '',
        userEmail: row.userEmail ?? '',
        requestedRole: row.requestedRole as InviteRole,
        status: row.status as any,
        createdAt: row.createdAt ?? new Date(0).toISOString(),
        reviewedAt: row.reviewedAt ?? null,
        reviewedBy: row.reviewedBy ?? null,
    }));
}

export async function getAccessRequestById(id: number, clubId: number) {
    const rows = await db.select().from(accessRequests)
        .where(and(eq(accessRequests.id, id), eq(accessRequests.clubId, clubId)))
        .limit(1);
    return rows[0] ?? null;
}

export async function approveAccessRequest(id: number, clubId: number, reviewedBy: number | null) {
    const updated = await db.update(accessRequests)
        .set({
            status: 'approved',
            reviewedAt: new Date().toISOString(),
            reviewedBy,
        })
        .where(and(eq(accessRequests.id, id), eq(accessRequests.clubId, clubId)))
        .returning();

    return updated[0] ?? null;
}

/**
 * A player-role access request whose link carried a team: approval lands
 * them on that team's roster right away, same as a parent's children do.
 * Claims an existing row first (already linked to this account, or an
 * unclaimed one an admin pre-created with the same email) instead of
 * creating a duplicate player.
 */
export async function placeApprovedPlayerOnTeam(request: { userId: number; userName: string | null; userEmail: string | null; teamId: number }) {
    // No unique constraint on (playerId, teamId) — check first, same as every
    // other membership insert in the app, so a repeat approval (e.g. a second
    // team) never doubles up the player on a team they're already on.
    const addToTeam = async (playerId: number) => {
        const already = await db.select({ id: playersToTeams.id }).from(playersToTeams)
            .where(and(eq(playersToTeams.playerId, playerId), eq(playersToTeams.teamId, request.teamId)))
            .limit(1);
        if (!already.length) await db.insert(playersToTeams).values({ playerId, teamId: request.teamId });
    };

    const [linked] = await db.select().from(players).where(eq(players.userId, request.userId)).limit(1);
    if (linked) {
        if (linked.teamId == null) await db.update(players).set({ teamId: request.teamId }).where(eq(players.id, linked.id));
        await addToTeam(linked.id);
        return;
    }

    const email = (request.userEmail ?? '').trim().toLowerCase();
    const [unclaimed] = email
        ? await db.select().from(players)
            .where(and(sql`lower(trim(${players.email})) = ${email}`, isNull(players.userId)))
            .orderBy(asc(players.id))
            .limit(1)
        : [];
    if (unclaimed) {
        await db.update(players).set({ userId: request.userId, teamId: unclaimed.teamId ?? request.teamId }).where(eq(players.id, unclaimed.id));
        await addToTeam(unclaimed.id);
        return;
    }

    const { firstName, lastName } = splitDisplayName(request.userName);
    const [created] = await db.insert(players).values({
        name: request.userName,
        firstName,
        lastName,
        status: 'active',
        teamId: request.teamId,
        email: request.userEmail,
        userId: request.userId,
    }).returning({ id: players.id });
    await db.insert(playersToTeams).values({ playerId: created.id, teamId: request.teamId });
}

export async function denyAccessRequest(id: number, clubId: number, reviewedBy: number | null) {
    const updated = await db.update(accessRequests)
        .set({
            status: 'denied',
            reviewedAt: new Date().toISOString(),
            reviewedBy,
        })
        .where(and(eq(accessRequests.id, id), eq(accessRequests.clubId, clubId)))
        .returning();

    return updated[0] ?? null;
}

export async function updateUserAccess(userId: number, payload: { clubId: number; role: InviteRole; status: 'active' | 'disabled'; }) {
    const updated = await db.update(users)
        .set({
            clubId: payload.clubId,
            role: payload.role as any,
            status: payload.status as any,
        })
        .where(eq(users.id, userId))
        .returning();

    return updated.length > 0 ? (updated[0] as unknown as UserDoc) : null;
}

function sameTeam(teamId: number | null) {
    return teamId == null ? isNull(inviteLinks.teamId) : eq(inviteLinks.teamId, teamId);
}

/** One active link per role and team (or per role, when no team is chosen). */
export async function deactivateActiveInviteLinks(clubId: number, role: InviteRole, teamId: number | null = null) {
    await db.update(inviteLinks)
        .set({ isActive: 0 })
        .where(and(
            eq(inviteLinks.clubId, clubId),
            eq(inviteLinks.role, role as any),
            sameTeam(teamId),
            eq(inviteLinks.isActive, 1)
        ));
}

export async function createInviteLink(payload: {
    clubId: number;
    role: InviteRole;
    token: string;
    tokenHash: string;
    expiresAt: Date;
    refreshIntervalMinutes: number;
    createdBy: number | null;
    teamId?: number | null;
}) {
    const record = {
        clubId: payload.clubId,
        role: payload.role as any,
        teamId: payload.teamId ?? null,
        token: encryptInviteToken(payload.token),
        tokenHash: payload.tokenHash,
        expiresAt: payload.expiresAt.toISOString(),
        refreshIntervalMinutes: payload.refreshIntervalMinutes,
        createdBy: payload.createdBy,
        createdAt: new Date().toISOString(),
        isActive: 1,
    };

    const inserted = await db.insert(inviteLinks).values(record).returning({ id: inviteLinks.id });
    const createdId = inserted[0]?.id;

    if (!createdId) {
        return null;
    }

    const rows = await db.select(inviteLinkSelection()).from(inviteLinks)
        .where(eq(inviteLinks.id, createdId))
        .limit(1);

    return withDecryptedToken(rows[0] as InviteLinkRow | undefined);
}

export async function getLatestInviteLinkForClubRole(clubId: number, role: InviteRole) {
    const rows = await db.select(inviteLinkSelection()).from(inviteLinks)
        .where(and(eq(inviteLinks.clubId, clubId), eq(inviteLinks.role, role as any)))
        .orderBy(desc(inviteLinks.createdAt))
        .limit(1);

    return withDecryptedToken(rows[0] as InviteLinkRow | undefined);
}

export async function getActiveInviteLinkForClubRole(clubId: number, role: InviteRole, teamId: number | null = null) {
    const rows = await db.select(inviteLinkSelection()).from(inviteLinks)
        .where(and(
            eq(inviteLinks.clubId, clubId),
            eq(inviteLinks.role, role as any),
            sameTeam(teamId),
            eq(inviteLinks.isActive, 1)
        ))
        .orderBy(desc(inviteLinks.createdAt))
        .limit(1);

    return withDecryptedToken(rows[0] as InviteLinkRow | undefined);
}

export async function findInviteLinkByTokenHash(tokenHash: string) {
    const rows = await db.select(inviteLinkSelection()).from(inviteLinks)
        .where(eq(inviteLinks.tokenHash, tokenHash))
        .limit(1);
        
    const invite = withDecryptedToken(rows[0] as InviteLinkRow | undefined);
    if (!invite) {
        return null;
    }

    const club = await getClubById(invite.clubId);
    const teamRows = invite.teamId != null
        ? await db.select({ name: teams.name, isActive: teams.isActive }).from(teams)
            .where(and(eq(teams.id, invite.teamId), eq(teams.clubId, invite.clubId))).limit(1)
        : [];

    return {
        ...invite,
        clubName: club?.name ?? null,
        // A team that has since been archived or deleted no longer counts.
        teamName: teamRows[0]?.isActive ? teamRows[0].name : null,
    };
}
