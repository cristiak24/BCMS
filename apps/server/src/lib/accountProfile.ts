import { and, asc, eq, inArray, ne, sql } from 'drizzle-orm';
import { db } from '../db';
import { players, playerGuardians, playersToTeams, teams, users } from '../db/schema';

type TeamRef = { id: number; name: string };

export type AccountProfile = {
    id: number;
    email: string;
    name: string;
    role: string;
    status: string;
    phone: string | null;
    createdAt: string;
    lastLoginAt: string | null;
    /** Teams a coach leads, or the teams of a player account. */
    teams: TeamRef[];
    /** Parents: the linked children, each with the other parents on the same child. */
    family: {
        id: number;
        name: string;
        birthYear: number | null;
        number: number | null;
        teams: TeamRef[];
        parents: { id: number; name: string; email: string }[];
    }[];
};

async function teamsOfPlayers(playerIds: number[], clubId: number | null) {
    const byPlayer = new Map<number, TeamRef[]>();
    if (playerIds.length === 0) return byPlayer;
    const clubFilter = clubId != null ? [eq(teams.clubId, clubId)] : [];

    const [direct, viaJoin] = await Promise.all([
        db.select({ playerId: players.id, id: teams.id, name: teams.name }).from(players)
            .innerJoin(teams, eq(teams.id, players.teamId))
            .where(and(inArray(players.id, playerIds), ...clubFilter)),
        db.select({ playerId: playersToTeams.playerId, id: teams.id, name: teams.name }).from(playersToTeams)
            .innerJoin(teams, eq(teams.id, playersToTeams.teamId))
            .where(and(inArray(playersToTeams.playerId, playerIds), ...clubFilter)),
    ]);
    for (const row of [...direct, ...viaJoin]) {
        const list = byPlayer.get(row.playerId) ?? [];
        if (!list.some((team) => team.id === row.id)) list.push({ id: row.id, name: row.name });
        byPlayer.set(row.playerId, list);
    }
    return byPlayer;
}

/**
 * The admin's view of one account: contact data plus the role-specific part —
 * a coach's teams, a player's teams, a parent's family. Only identity and
 * roster basics; medical and finance fields stay on their own screens.
 */
export async function loadAccountProfile(user: typeof users.$inferSelect): Promise<AccountProfile> {
    const profile: AccountProfile = {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        status: user.status,
        phone: user.phone ?? null,
        createdAt: user.createdAt,
        lastLoginAt: user.lastLoginAt ?? null,
        teams: [],
        family: [],
    };

    if (user.role === 'coach') {
        const conditions = [eq(teams.coachId, user.id), eq(teams.isActive, true)];
        if (user.clubId != null) conditions.push(eq(teams.clubId, user.clubId));
        profile.teams = await db.select({ id: teams.id, name: teams.name }).from(teams)
            .where(and(...conditions))
            .orderBy(asc(teams.name));
        return profile;
    }

    if (user.role === 'player') {
        const own = await db.select({ id: players.id }).from(players)
            .where(sql`lower(${players.email}) = ${user.email.trim().toLowerCase()}`)
            .limit(5);
        const byPlayer = await teamsOfPlayers(own.map((row) => row.id), user.clubId);
        const seen = new Set<number>();
        for (const list of byPlayer.values()) {
            for (const team of list) {
                if (!seen.has(team.id)) {
                    seen.add(team.id);
                    profile.teams.push(team);
                }
            }
        }
        return profile;
    }

    if (user.role === 'parent') {
        const children = await db
            .select({
                id: players.id,
                name: players.name,
                firstName: players.firstName,
                lastName: players.lastName,
                birthYear: players.birthYear,
                number: players.number,
            })
            .from(playerGuardians)
            .innerJoin(players, eq(players.id, playerGuardians.playerId))
            .where(eq(playerGuardians.userId, user.id))
            .orderBy(asc(players.firstName), asc(players.lastName));
        if (children.length === 0) return profile;

        const childIds = children.map((child) => child.id);
        const [teamMap, coParents] = await Promise.all([
            teamsOfPlayers(childIds, user.clubId),
            db.select({ playerId: playerGuardians.playerId, id: users.id, name: users.name, email: users.email })
                .from(playerGuardians)
                .innerJoin(users, eq(users.id, playerGuardians.userId))
                .where(and(inArray(playerGuardians.playerId, childIds), ne(playerGuardians.userId, user.id))),
        ]);

        profile.family = children.map((child) => ({
            id: child.id,
            name: `${child.firstName ?? ''} ${child.lastName ?? ''}`.trim() || child.name || 'Copil',
            birthYear: child.birthYear ?? null,
            number: child.number ?? null,
            teams: teamMap.get(child.id) ?? [],
            parents: coParents
                .filter((row) => row.playerId === child.id)
                .map((row) => ({ id: row.id, name: row.name, email: row.email })),
        }));
    }

    return profile;
}
