/**
 * The one place the client turns API timestamps into Dates, and form input
 * into API timestamps (audit P0-3, P1-15, R3-4).
 *
 * The database stores zone-less `timestamp` values that are UTC by convention.
 * The server now sends ISO with `Z`, but older responses (and any route that
 * forgot to map a column) carried "2026-10-16 15:00:00", which `new Date()`
 * reads as *browser-local* time — a 18:00 training showed at 15:00. Zone-less
 * date-times are therefore parsed as UTC here, never as local.
 */

/** Clubs are in Romania; calendar days (visa expiry, due dates) are Bucharest days. */
export const CLUB_TIME_ZONE = 'Europe/Bucharest';

const NAIVE_DATE_TIME = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})(?::(\d{2})(?:\.(\d+))?)?$/;
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const TIME_OF_DAY = /^([01]\d|2[0-3]):([0-5]\d)$/;

/**
 * Drop-in for `new Date(apiValue)`: same result for ISO strings, numbers and
 * Dates; zone-less "YYYY-MM-DD HH:MM[:SS[.fff]]" is read as UTC instead of
 * local. Unparseable input gives an Invalid Date, exactly like `new Date()`.
 */
export function parseApiDate(value: string | number | Date | null | undefined): Date {
  if (typeof value === 'string') {
    const match = NAIVE_DATE_TIME.exec(value.trim());
    if (match) {
      const [, day, hoursMinutes, seconds = '00', fraction = ''] = match;
      const millis = fraction ? `.${fraction.slice(0, 3).padEnd(3, '0')}` : '';
      return new Date(`${day}T${hoursMinutes}:${seconds}${millis}Z`);
    }
    return new Date(value.trim());
  }
  if (value instanceof Date) return new Date(value.getTime());
  return new Date(value as number);
}

export function isValidDate(date: Date): boolean {
  return !Number.isNaN(date.getTime());
}

/**
 * A wall-clock date and time typed into a form ("2026-10-22", "19:00"), in the
 * browser's zone, as ISO with `Z` — what the server requires for event times.
 * Null when either part is malformed.
 */
export function localDateTimeToIso(day: string, time: string): string | null {
  if (!DATE_ONLY.test(day) || !TIME_OF_DAY.test(time)) return null;
  // A date-time string without an offset is local time per the JS spec.
  const date = new Date(`${day}T${time}:00`);
  return isValidDate(date) ? date.toISOString() : null;
}

/**
 * The Romanian calendar day of a stored instant, as "YYYY-MM-DD" for a date
 * input. `toISOString().slice(0, 10)` gave the UTC day instead, so a visa
 * stored at local midnight showed (and re-saved as) the previous day (WP3.3).
 */
export function toCalendarDay(value: string | number | Date | null | undefined): string {
  if (value == null || value === '') return '';
  if (typeof value === 'string' && DATE_ONLY.test(value.trim())) return value.trim();
  const date = parseApiDate(value);
  if (!isValidDate(date)) return '';
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: CLUB_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(date);
}

/**
 * A calendar day from a date input as the value to store: noon UTC, which is
 * the same Romanian day in summer and winter time, whatever zone reads it.
 */
export function calendarDayToIso(day: string): string | null {
  if (!DATE_ONLY.test(day)) return null;
  const date = new Date(`${day}T12:00:00.000Z`);
  return isValidDate(date) && date.toISOString().slice(0, 10) === day ? date.toISOString() : null;
}
