import { and, eq, inArray, ne } from 'drizzle-orm';
import { db } from '../db';
import { teams, users } from '../db/schema';

/**
 * Deactivating a coach who still leads teams (audit, round 4): the account
 * kept its teams.coach_id, so those teams were no longer "without a coach"
 * and no other coach could take them (lib/coachScope.ts). Deactivation now
 * stops on such an account until the admin says who takes the teams — another
 * active coach (or admin) of the club, or nobody for now.
 */

export type HandoverDecision = { decided: false } | { decided: true; reassignTo: number | null };

/** `teamsReassignTo`: a user id, or null = leave the teams without a coach. Absent = not decided. */
export function parseHandover(body: unknown): HandoverDecision | { error: string } {
    const raw = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
    if (!Object.prototype.hasOwnProperty.call(raw, 'teamsReassignTo')) return { decided: false };
    const value = raw.teamsReassignTo;
    if (value == null || value === '') return { decided: true, reassignTo: null };
    const id = Number(value);
    if (!Number.isInteger(id) || id <= 0) return { error: 'Antrenorul ales nu este valid.' };
    return { decided: true, reassignTo: id };
}

export async function coachedTeams(userId: number) {
    return db.select({ id: teams.id, name: teams.name }).from(teams).where(eq(teams.coachId, userId));
}

/** Who can take the teams over: the club's other active coaches and admins. */
export async function handoverCandidates(clubId: number | null, excludeUserId: number) {
    if (clubId == null) return [];
    const rows = await db.select({ id: users.id, name: users.name, role: users.role }).from(users).where(and(
        eq(users.clubId, clubId),
        eq(users.status, 'active'),
        inArray(users.role, ['coach', 'admin']),
        ne(users.id, excludeUserId),
    ));
    // Coaches first: the dialog offers the first one by default.
    return rows.sort((a, b) => Number(a.role !== 'coach') - Number(b.role !== 'coach') || a.name.localeCompare(b.name, 'ro'));
}

/** The 409 body a client turns into the "who takes the teams?" step. */
export async function handoverRequired(user: { id: number; name: string; clubId: number | null }, teamRows: { id: number; name: string }[]) {
    return {
        error: `${user.name} antrenează ${teamRows.map((t) => t.name).join(', ')}. Alege cine preia ${teamRows.length === 1 ? 'echipa' : 'echipele'} înainte de dezactivare.`,
        code: 'coach_has_teams',
        teams: teamRows,
        candidates: await handoverCandidates(user.clubId, user.id),
    };
}

/** Checks the chosen successor; returns an error message, or null when it is fine. */
export async function validateSuccessor(reassignTo: number | null, clubId: number | null, outgoingId: number) {
    if (reassignTo == null) return null;
    if (reassignTo === outgoingId) return 'Alege alt antrenor decât contul dezactivat.';
    const candidates = await handoverCandidates(clubId, outgoingId);
    return candidates.some((c) => c.id === reassignTo) ? null : 'Antrenorul ales nu este activ în acest club.';
}

type Exec = Pick<typeof db, 'update'>;

/** Moves the outgoing coach's teams to the successor (or to nobody). */
export async function reassignCoachedTeams(exec: Exec, outgoingId: number, reassignTo: number | null) {
    return exec.update(teams).set({ coachId: reassignTo }).where(eq(teams.coachId, outgoingId)).returning({ id: teams.id, name: teams.name });
}
