/**
 * Attendance rate on every screen (Dashboard, Lot, Echipă, Acasă antrenor) —
 * the client half of apps/server/src/lib/attendanceRate.ts: the last 30 days,
 * attended ÷ (attended + absent) pooled over marked sessions, "late" counted
 * as attended and excused/medical left out. The server computes the rates;
 * this pools per-player counts the same way and says what the number means.
 * Pure, see attendanceRate.test.ts.
 */

export const ATTENDANCE_PERIOD_DAYS = 30;

/** Short caption under a rate: the period. */
export const ATTENDANCE_PERIOD_LABEL = `Ultimele ${ATTENDANCE_PERIOD_DAYS} de zile`;

/** The definition, for a tooltip / footnote. */
export const ATTENDANCE_DEFINITION = `Prezenți (inclusiv întârziați) din sesiunile marcate în ultimele ${ATTENDANCE_PERIOD_DAYS} de zile; absențele motivate nu intră în calcul.`;

type Counts = { attendanceAttended?: number | null; attendanceCounted?: number | null };

/**
 * A group's rate from its players' counts — pooled, so a player with one
 * session weighs one session, and players with nothing marked add nothing
 * (averaging per-player rates counted them as 0%). null = nothing marked.
 */
export function pooledAttendanceRate(players: Counts[]) {
  let attended = 0;
  let counted = 0;
  for (const player of players) {
    attended += Math.max(0, Number(player.attendanceAttended) || 0);
    counted += Math.max(0, Number(player.attendanceCounted) || 0);
  }
  return counted ? Math.round((attended / counted) * 100) : null;
}

/** "68%" / "—". */
export function formatAttendanceRate(rate: number | null | undefined) {
  return rate == null ? '—' : `${Math.round(rate)}%`;
}
