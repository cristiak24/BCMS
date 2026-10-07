/**
 * What a coach may change — pure, see coachScope.test.ts.
 *
 * Club-wide access let any coach edit or delete another squad's sessions,
 * attendance and players. A coach now manages:
 *  - teams they are the assigned coach of;
 *  - teams with no coach assigned yet (so a club that never filled in
 *    coaches keeps working as before);
 *  - any single event they are assigned to, whichever team it belongs to.
 * Admins are unaffected.
 */

function toId(value: unknown) {
    const id = Number(value);
    return Number.isInteger(id) && id > 0 ? id : null;
}

export function coachManagesTeam(teamCoachId: unknown, userId: unknown) {
    const coach = toId(teamCoachId);
    const user = toId(userId);
    return coach == null || (user != null && coach === user);
}

export function coachManagesEvent(teamCoachId: unknown, eventCoachId: unknown, userId: unknown) {
    const user = toId(userId);
    return coachManagesTeam(teamCoachId, userId) || (user != null && toId(eventCoachId) === user);
}

/** Team ids a coach manages, out of the club's teams. */
export function teamsManagedByCoach(teams: Array<{ id: number; coachId: number | null }>, userId: unknown) {
    return teams.filter((team) => coachManagesTeam(team.coachId, userId)).map((team) => team.id);
}
