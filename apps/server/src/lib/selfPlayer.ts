import { asc, eq, inArray, sql } from 'drizzle-orm';
import type { Request } from 'express';
import { db } from '../db';
import { playerGuardians, players, playersToTeams } from '../db/schema';

/**
 * "Whose player screens are these?" — one answer for every player-facing route.
 *
 *  - player: the players row whose email is the account's email (as before);
 *  - parent: one of their linked children (player_guardians). The client says
 *    which in the `X-BCMS-Child` header; it is only a *selection* and is checked
 *    against the caller's own links, so it can never reach someone else's
 *    child. Missing/unknown → the first child.
 *
 * Identity still comes from the bearer token only (see middleware/auth.ts).
 */

export const CHILD_HEADER = 'x-bcms-child';

type Caller = { id?: unknown; role?: unknown; email?: unknown } | null | undefined;

export function requestedChildId(req: Pick<Request, 'header'>) {
    const raw = Number(req.header(CHILD_HEADER));
    return Number.isInteger(raw) && raw > 0 ? raw : null;
}

/** Children linked to a parent account, oldest link first. */
export async function guardianChildren(userId: number) {
    return db
        .select({ player: players })
        .from(playerGuardians)
        .innerJoin(players, eq(players.id, playerGuardians.playerId))
        .where(eq(playerGuardians.userId, userId))
        .orderBy(asc(playerGuardians.id))
        .then((rows) => rows.map((row) => row.player));
}

export async function resolveSelfPlayer(user: Caller, childId: number | null = null) {
    if (!user) return null;
    if (user.role === 'parent' && user.id != null) {
        const children = await guardianChildren(Number(user.id));
        return children.find((child) => child.id === childId) ?? children[0] ?? null;
    }
    const email = String(user.email ?? '').trim().toLowerCase();
    if (!email) return null;
    const rows = await db.select().from(players).where(sql`lower(trim(${players.email})) = ${email}`).limit(1);
    return rows[0] ?? null;
}

export async function resolveSelfPlayerForRequest(req: Pick<Request, 'header'> & { user?: Caller }) {
    return resolveSelfPlayer(req.user, requestedChildId(req));
}

/** Team ids of a player (legacy players.team_id + memberships). */
export async function teamIdsOfPlayers(playerIds: number[]) {
    if (!playerIds.length) return [];
    const [direct, memberships] = await Promise.all([
        db.select({ teamId: players.teamId }).from(players).where(inArray(players.id, playerIds)),
        db.select({ teamId: playersToTeams.teamId }).from(playersToTeams).where(inArray(playersToTeams.playerId, playerIds)),
    ]);
    const ids = new Set<number>();
    direct.forEach((row) => { if (row.teamId != null) ids.add(row.teamId); });
    memberships.forEach((row) => ids.add(row.teamId));
    return Array.from(ids);
}
