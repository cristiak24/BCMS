/**
 * What a coach may change, and what they may read — pure, see
 * coachScope.test.ts. Admins are unaffected.
 *
 * WRITE (attendance, events, match sheets, L12, player records): teams they
 * are the assigned coach of, plus any single event they are assigned to.
 * A team with no coach yet is the club admin's to change (WP7-F1, club
 * decision 2026-10-20): it used to give every coach write access.
 *
 * READ (sessions, squad lists, contacts): their teams, events assigned to
 * them, and teams with no coach yet — the WP4A visibility rule, so a club
 * that never filled in coaches still shows coaches its sessions.
 */

function toId(value: unknown) {
    const id = Number(value);
    return Number.isInteger(id) && id > 0 ? id : null;
}

/** Write access to a team: its assigned coach only. */
export function coachManagesTeam(teamCoachId: unknown, userId: unknown) {
    const coach = toId(teamCoachId);
    const user = toId(userId);
    return user != null && coach === user;
}

/** Read access to a team: its coach, or any coach while it has none. */
export function coachReadsTeam(teamCoachId: unknown, userId: unknown) {
    return toId(teamCoachId) == null ? toId(userId) != null : coachManagesTeam(teamCoachId, userId);
}

/** Write access to one event: the team's coach or the coach assigned to the event. */
export function coachManagesEvent(teamCoachId: unknown, eventCoachId: unknown, userId: unknown) {
    const user = toId(userId);
    return coachManagesTeam(teamCoachId, userId) || (user != null && toId(eventCoachId) === user);
}

/** Read access to one event (and its attendance sheet). */
export function coachReadsEvent(teamCoachId: unknown, eventCoachId: unknown, userId: unknown) {
    return coachReadsTeam(teamCoachId, userId) || coachManagesEvent(teamCoachId, eventCoachId, userId);
}

/** Team ids a coach may change, out of the club's teams. */
export function teamsManagedByCoach(teams: Array<{ id: number; coachId: number | null }>, userId: unknown) {
    return teams.filter((team) => coachManagesTeam(team.coachId, userId)).map((team) => team.id);
}

/** Team ids a coach may read, out of the club's teams. */
export function teamsReadableByCoach(teams: Array<{ id: number; coachId: number | null }>, userId: unknown) {
    return teams.filter((team) => coachReadsTeam(team.coachId, userId)).map((team) => team.id);
}

/**
 * What a coach may SEE of a player's personal data (contacts, medical visa,
 * payments, attendance notes): players of a team they manage, or players on
 * no team yet (so they can be added to one). Another squad's players are
 * not theirs to read — club decision on P1-5 (2026-10-16).
 */
export function coachSeesPlayer(playerTeamIds: Iterable<number>, managedTeamIds: Iterable<number>) {
    const managed = new Set(managedTeamIds);
    let onAnyTeam = false;
    for (const teamId of playerTeamIds) {
        if (managed.has(teamId)) return true;
        onAnyTeam = true;
    }
    return !onAnyTeam;
}
