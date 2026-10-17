/**
 * Which club sessions a coach's screens (Program, Prezență, Acasă, Echipe)
 * show. Pure, see coachEventScope.test.ts.
 *
 * It used to keep only events whose own `coachId` was the coach, which the
 * admin's event form never sets, so a coach never saw their team's sessions
 * the admin created and could not mark attendance for them; with nothing
 * assigned it fell back to the whole club. It now mirrors the server's rule
 * for what a coach manages (apps/server/src/lib/coachScope.ts):
 *  - sessions of teams they are the assigned coach of;
 *  - sessions of teams with no coach assigned yet;
 *  - any single session they are assigned to, whichever team it belongs to.
 * There is no club-wide fallback.
 */

type ScopedEvent = { teamId: number | null; coachId: number | null };
type ScopedTeam = { id: number; coachId: number | null };

function toId(value: unknown) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

/** Ids of the teams the coach manages, out of the club's teams. */
export function coachManagedTeamIds(teams: ScopedTeam[], coachId: unknown) {
  const coach = toId(coachId);
  if (coach == null) return new Set<number>();
  return new Set(
    teams
      .filter((team) => {
        const teamCoach = toId(team.coachId);
        return teamCoach == null || teamCoach === coach;
      })
      .map((team) => team.id),
  );
}

export function filterCoachEvents<T extends ScopedEvent>(events: T[], teams: ScopedTeam[], coachId: unknown): T[] {
  const coach = toId(coachId);
  if (coach == null) return [];
  const teamIds = coachManagedTeamIds(teams, coach);
  return events.filter((event) =>
    toId(event.coachId) === coach || (event.teamId != null && teamIds.has(Number(event.teamId))),
  );
}
