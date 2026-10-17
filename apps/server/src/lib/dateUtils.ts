/**
 * Every column is `timestamp` (no time zone) read in Drizzle's string mode, so
 * the database hands back wall-clock text like "2026-10-16 15:00:00". Those
 * values are UTC by convention (the server normalises input with
 * toISOString() before writing, and Postgres `now()` runs in UTC on Neon and
 * PGlite). `new Date()` on such text uses the *process* time zone, which made
 * every reading depend on where the server happened to run (audit P1-15).
 */
const NAIVE_TIMESTAMP = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})(?::(\d{2})(?:\.(\d+))?)?$/;

/** The exact text Postgres emits for a `timestamp` column (space separator). */
const DB_TIMESTAMP_TEXT = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(?:\.\d{1,6})?$/;

/** Parses a naive timestamp string as UTC; null when the text is not naive. */
function parseNaiveUtc(value: string): Date | null {
  const match = NAIVE_TIMESTAMP.exec(value.trim());
  if (!match) return null;
  const [, day, hoursMinutes, seconds = '00', fraction = ''] = match;
  const millis = fraction ? `.${fraction.slice(0, 3).padEnd(3, '0')}` : '';
  const date = new Date(`${day}T${hoursMinutes}:${seconds}${millis}Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function toDate(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value === 'string') {
    const naive = parseNaiveUtc(value);
    if (naive) return naive;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  if (typeof value === 'number') {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  if (
    typeof value === 'object' &&
    value &&
    'toDate' in value &&
    typeof (value as { toDate: () => Date }).toDate === 'function'
  ) {
    return (value as { toDate: () => Date }).toDate();
  }
  return null;
}

export function toIso(value: unknown): string | null {
  return toDate(value)?.toISOString() ?? null;
}

/**
 * `app.set('json replacer', …)`: rewrites raw `timestamp` text that a route
 * forgot to map ("2026-10-16 15:00:00") into ISO with `Z`, so no response can
 * leak a zone-less time the browser would read as local (audit R3-4, P1-15).
 * Only the exact Postgres output shape matches; ISO strings and plain dates
 * ("2026-10-16") pass through untouched.
 */
export function isoTimestampReplacer(_key: string, value: unknown): unknown {
  if (typeof value === 'string' && DB_TIMESTAMP_TEXT.test(value)) {
    return toIso(value) ?? value;
  }
  return value;
}
