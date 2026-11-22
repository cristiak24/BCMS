import { sql } from 'drizzle-orm';
import { players, playersToTeams } from '../db/schema';

/**
 * Players have no club column: a player belongs to a club through its teams.
 * One on no team yet (a child added before any team, a member waiting for a
 * squad) belongs to the club of the account it is linked to — its own email
 * or user_id, or a guardian's account.
 *
 * That fallback is for players on NO team only. Applied to every player, it
 * pulled another club's player (whose record carries the email of one of this
 * club's accounts — a parent with children in two clubs, a coach who also
 * plays elsewhere) into this club's roster, player record, contacts and
 * finance books, and let this club's admin edit them or move them onto one of
 * its own teams (AUDIT-SECURITY-2026-11 P1-4).
 *
 * SQL for "this players row is on no team at all", to AND with any
 * email/account/guardian link condition.
 */
export const teamlessPlayer = sql`(${players.teamId} is null and not exists (select 1 from ${playersToTeams} where ${playersToTeams.playerId} = ${players.id}))`;

/** The same rule in JS, for a row whose memberships are already loaded. */
export function isTeamless(player: { teamId?: number | null }, membershipCount: number) {
    return player.teamId == null && membershipCount === 0;
}
