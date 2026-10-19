import { toCalendarDay } from './dates';

export type MedicalStatus = 'valid' | 'soon' | 'expired' | 'missing';

/** Whole days from one "YYYY-MM-DD" to another. */
function daysBetween(from: string, to: string) {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

/**
 * A medical visa is valid through its expiry DAY, Romanian calendar. It was
 * read with `new Date(...)`: a zone-less stored value shifted by the device's
 * zone, and a visa "valabilă până la 20 oct." turned "expirată" during the
 * 20th itself (audit WP7-E8, the WP3 kind of bug).
 */
export function medicalStatus(expiry: string | null | undefined, now: Date = new Date()): MedicalStatus {
  const day = toCalendarDay(expiry);
  if (!day) return 'missing';
  const left = daysBetween(toCalendarDay(now), day);
  if (left < 0) return 'expired';
  if (left <= 30) return 'soon';
  return 'valid';
}
