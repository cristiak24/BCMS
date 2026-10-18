/**
 * "Ritm de elită" is a verdict on a habit, so it needs a habit to judge:
 * 1 present out of 1 session read "Ritm de elită — 1/1 sesiuni". Below this
 * many marked sessions a high rate is only "a good start".
 */
export const ELITE_MIN_SESSIONS = 5;
export const ELITE_MIN_RATE = 90;

export function isEliteRhythm(rate: number | null, sessions: number) {
  return rate != null && rate >= ELITE_MIN_RATE && sessions >= ELITE_MIN_SESSIONS;
}
