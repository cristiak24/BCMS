import { and, desc, eq, inArray, or } from 'drizzle-orm';
import { db } from '../db';
import { clubs, familyJoinRequests, players, playerGuardians, playersToTeams, teams, users } from '../db/schema';
import { suggestPlayerMatches, teamCodeCandidates, type ChildInput, type TeamSignupInput } from './familyJoin';

/**
 * DB side of joining a team with its code: create the requests at signup,
 * list them for the people allowed to decide (club admins: the whole club;
 * coaches: the teams they coach), approve or deny.
 */

export type Reviewer = { id: number; role: string; clubId: number | null };

export async function findTeamByJoinCode(raw: string) {
    const candidates = teamCodeCandidates(raw);
    const rows = await db
        .select({ team: teams, clubName: clubs.name })
        .from(teams)
        .leftJoin(clubs, eq(clubs.id, teams.clubId))
        .where(and(inArray(teams.inviteCode, candidates), eq(teams.isActive, true)))
        .limit(2);
    // Prefer the literal match over the O→0 / I→1 reading.
    const hit = rows.find((row) => row.team.inviteCode === candidates[0]) ?? rows[0];
    if (!hit || hit.team.clubId == null) return null;
    return { team: hit.team, clubName: hit.clubName ?? null };
}

/** Called once the account row exists; one pending request per child (or one for the player). */
export async function createJoinRequests(params: {
    userId: number;
    team: typeof teams.$inferSelect;
    input: TeamSignupInput;
    firstName: string;
    lastName: string;
}) {
    const base = { clubId: params.team.clubId!, teamId: params.team.id, userId: params.userId, kind: params.input.kind };
    const rows = params.input.kind === 'parent'
        ? params.input.children.map((child) => ({
            ...base,
            childFirstName: child.firstName,
            childLastName: child.lastName,
            childBirthDate: child.birthDate,
        }))
        : [{
            ...base,
            childFirstName: params.firstName,
            childLastName: params.lastName,
            childBirthDate: params.input.birthDate,
        }];
    return db.insert(familyJoinRequests).values(rows).returning();
}

/**
 * A parent signed up with an admin-issued code or link: create each child as a
 * player (in the code's team when it has one, otherwise unassigned) and link
 * the parent. Always a new record — matching by name here would let anyone
 * claim an existing child's record without a club admin looking at it.
 */
export async function createChildrenForParent(params: {
    userId: number;
    teamId: number | null;
    children: ChildInput[];
}) {
    return db.transaction(async (tx) => {
        const created: { id: number }[] = [];
        for (const child of params.children) {
            const [player] = await tx.insert(players).values({
                name: `${child.firstName} ${child.lastName}`,
                firstName: child.firstName,
                lastName: child.lastName,
                birthYear: Number(child.birthDate.slice(0, 4)),
                status: 'active',
                teamId: params.teamId,
            }).returning({ id: players.id });
            if (params.teamId != null) {
                await tx.insert(playersToTeams).values({ playerId: player.id, teamId: params.teamId });
            }
            await tx.insert(playerGuardians)
                .values({ playerId: player.id, userId: params.userId, createdBy: params.userId })
                .onConflictDoNothing();
            created.push(player);
        }
        return created;
    });
}

/** Team ids this reviewer may decide on. null = every team of their club. */
async function reviewableTeamIds(reviewer: Reviewer): Promise<number[] | null> {
    if (reviewer.role === 'admin' || reviewer.role === 'superadmin') return null;
    if (reviewer.role !== 'coach' || reviewer.clubId == null) return [];
    const rows = await db.select({ id: teams.id }).from(teams)
        .where(and(eq(teams.clubId, reviewer.clubId), eq(teams.coachId, reviewer.id)));
    return rows.map((row) => row.id);
}

export async function listJoinRequests(reviewer: Reviewer, status: 'pending' | 'all' = 'pending') {
    if (reviewer.clubId == null) return [];
    const teamIds = await reviewableTeamIds(reviewer);
    if (teamIds && teamIds.length === 0) return [];

    const filters = [eq(familyJoinRequests.clubId, reviewer.clubId)];
    if (teamIds) filters.push(inArray(familyJoinRequests.teamId, teamIds));
    if (status === 'pending') filters.push(eq(familyJoinRequests.status, 'pending'));

    const rows = await db
        .select({
            request: familyJoinRequests,
            teamName: teams.name,
            userName: users.name,
            userEmail: users.email,
            userPhone: users.phone,
        })
        .from(familyJoinRequests)
        .innerJoin(teams, eq(teams.id, familyJoinRequests.teamId))
        .innerJoin(users, eq(users.id, familyJoinRequests.userId))
        .where(and(...filters))
        .orderBy(desc(familyJoinRequests.createdAt))
        .limit(200);
    if (!rows.length) return [];

    // Candidates for "is this child already on the books?": the club's players.
    const clubTeamIds = (await db.select({ id: teams.id }).from(teams).where(eq(teams.clubId, reviewer.clubId))).map((t) => t.id);
    const [direct, viaJoin] = await Promise.all([
        db.select().from(players).where(inArray(players.teamId, clubTeamIds)),
        db.select({ player: players, teamId: playersToTeams.teamId }).from(playersToTeams)
            .innerJoin(players, eq(players.id, playersToTeams.playerId))
            .where(inArray(playersToTeams.teamId, clubTeamIds)),
    ]);
    const teamNameById = new Map((await db.select({ id: teams.id, name: teams.name }).from(teams).where(inArray(teams.id, clubTeamIds))).map((t) => [t.id, t.name]));
    const pool = new Map<number, { row: typeof players.$inferSelect; teamIds: Set<number> }>();
    direct.forEach((row) => pool.set(row.id, { row, teamIds: new Set(row.teamId != null ? [row.teamId] : []) }));
    viaJoin.forEach(({ player, teamId }) => {
        const entry = pool.get(player.id) ?? { row: player, teamIds: new Set<number>() };
        entry.teamIds.add(teamId);
        pool.set(player.id, entry);
    });
    const guardianCounts = new Map<number, number>();
    if (pool.size) {
        (await db.select({ playerId: playerGuardians.playerId }).from(playerGuardians).where(inArray(playerGuardians.playerId, Array.from(pool.keys()))))
            .forEach((g) => guardianCounts.set(g.playerId, (guardianCounts.get(g.playerId) ?? 0) + 1));
    }
    const candidates = Array.from(pool.values()).map(({ row, teamIds: memberOf }) => ({
        id: row.id,
        firstName: row.firstName,
        lastName: row.lastName,
        birthYear: row.birthYear,
        number: row.number,
        hasAccount: Boolean(row.email),
        guardians: guardianCounts.get(row.id) ?? 0,
        teams: Array.from(memberOf).map((id) => teamNameById.get(id)).filter(Boolean) as string[],
    }));

    return rows.map(({ request, teamName, userName, userEmail, userPhone }) => ({
        id: request.id,
        kind: request.kind as 'parent' | 'player',
        status: request.status,
        team: { id: request.teamId, name: teamName },
        requester: { id: request.userId, name: userName, email: userEmail, phone: userPhone },
        child: { firstName: request.childFirstName, lastName: request.childLastName, birthDate: request.childBirthDate },
        playerId: request.playerId,
        createdAt: request.createdAt,
        suggestions: request.status === 'pending'
            ? suggestPlayerMatches({ firstName: request.childFirstName, lastName: request.childLastName, birthDate: request.childBirthDate }, candidates).slice(0, 3)
            : [],
    }));
}

export class JoinRequestError extends Error {
    constructor(message: string, readonly status = 400) {
        super(message);
    }
}

async function loadReviewable(reviewer: Reviewer, requestId: number) {
    if (reviewer.clubId == null) throw new JoinRequestError('Cererea nu există.', 404);
    const rows = await db.select().from(familyJoinRequests)
        .where(and(eq(familyJoinRequests.id, requestId), eq(familyJoinRequests.clubId, reviewer.clubId)))
        .limit(1);
    const request = rows[0];
    if (!request) throw new JoinRequestError('Cererea nu există.', 404);
    const teamIds = await reviewableTeamIds(reviewer);
    if (teamIds && !teamIds.includes(request.teamId)) throw new JoinRequestError('Cererea nu există.', 404);
    if (request.status !== 'pending') throw new JoinRequestError('Cererea a fost deja rezolvată.', 409);
    return request;
}

/**
 * Approve: link to `target` (an existing player id), create a new player
 * ('new'), or let the server pick ('auto': the single exact match, else new).
 */
export async function approveJoinRequest(reviewer: Reviewer, requestId: number, target: number | 'new' | 'auto') {
    const request = await loadReviewable(reviewer, requestId);
    const [requester] = await db.select().from(users).where(eq(users.id, request.userId)).limit(1);
    if (!requester) throw new JoinRequestError('Contul care a trimis cererea nu mai există.', 410);

    let playerId: number | 'new' = target === 'auto' ? 'new' : target;
    if (target === 'auto') {
        const [pending] = await listJoinRequests(reviewer).then((list) => list.filter((r) => r.id === requestId));
        const exact = pending?.suggestions.filter((s) => s.exact) ?? [];
        if (exact.length === 1) playerId = exact[0].id;
    }

    const clubTeamIds = (await db.select({ id: teams.id }).from(teams).where(eq(teams.clubId, request.clubId))).map((t) => t.id);

    return db.transaction(async (tx) => {
        let player: typeof players.$inferSelect;
        if (playerId === 'new') {
            [player] = await tx.insert(players).values({
                name: `${request.childFirstName} ${request.childLastName}`,
                firstName: request.childFirstName,
                lastName: request.childLastName,
                birthYear: request.childBirthDate ? Number(request.childBirthDate.slice(0, 4)) : null,
                status: 'active',
                teamId: request.teamId,
                email: request.kind === 'player' ? requester.email : null,
                phone: request.kind === 'player' ? requester.phone : null,
            }).returning();
            await tx.insert(playersToTeams).values({ playerId: player.id, teamId: request.teamId });
        } else {
            const found = await tx.select({ player: players }).from(players)
                .leftJoin(playersToTeams, eq(playersToTeams.playerId, players.id))
                .where(and(eq(players.id, playerId), or(inArray(players.teamId, clubTeamIds), inArray(playersToTeams.teamId, clubTeamIds))))
                .limit(1);
            if (!found[0]) throw new JoinRequestError('Jucătorul ales nu face parte din club.', 400);
            player = found[0].player;

            if (request.kind === 'player') {
                const email = requester.email.trim().toLowerCase();
                if (player.email && player.email.trim().toLowerCase() !== email) {
                    throw new JoinRequestError(`${player.firstName} ${player.lastName} are deja un cont de jucător.`, 409);
                }
                [player] = await tx.update(players)
                    .set({ email, phone: player.phone ?? requester.phone, birthYear: player.birthYear ?? (request.childBirthDate ? Number(request.childBirthDate.slice(0, 4)) : null) })
                    .where(eq(players.id, player.id))
                    .returning();
            } else if (player.birthYear == null && request.childBirthDate) {
                await tx.update(players).set({ birthYear: Number(request.childBirthDate.slice(0, 4)) }).where(eq(players.id, player.id));
            }

            // Already on the club's books but not on this team: add them to it.
            const onTeam = player.teamId === request.teamId || (await tx.select({ id: playersToTeams.id }).from(playersToTeams)
                .where(and(eq(playersToTeams.playerId, player.id), eq(playersToTeams.teamId, request.teamId))).limit(1)).length > 0;
            if (!onTeam) await tx.insert(playersToTeams).values({ playerId: player.id, teamId: request.teamId });
        }

        if (request.kind === 'parent') {
            await tx.insert(playerGuardians)
                .values({ playerId: player.id, userId: request.userId, createdBy: reviewer.id })
                .onConflictDoNothing();
        }

        await tx.update(familyJoinRequests)
            .set({ status: 'approved', playerId: player.id, reviewedBy: reviewer.id, reviewedAt: new Date().toISOString() })
            .where(eq(familyJoinRequests.id, request.id));

        // First approved request lets the account in.
        await tx.update(users)
            .set({ status: 'active', updatedAt: new Date().toISOString() })
            .where(and(eq(users.id, request.userId), eq(users.status, 'pending')));

        return { requestId: request.id, playerId: player.id, created: playerId === 'new' };
    });
}

export async function denyJoinRequest(reviewer: Reviewer, requestId: number) {
    const request = await loadReviewable(reviewer, requestId);
    await db.update(familyJoinRequests)
        .set({ status: 'denied', reviewedBy: reviewer.id, reviewedAt: new Date().toISOString() })
        .where(eq(familyJoinRequests.id, request.id));
    return { requestId: request.id };
}
