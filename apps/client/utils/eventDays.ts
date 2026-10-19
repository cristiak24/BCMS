import { parseApiDate } from './dates';

/**
 * The calendar days (local "YYYY-MM-DD") an event covers. A camp from Friday to
 * Monday showed only on Friday: the month grid filed every event under its
 * start day. Pure, see eventDays.test.ts.
 *
 * Only events of at least 12 hours span days: a match from 23:00 to 00:30 is an
 * evening match, not a two-day event. An end exactly at midnight does not open
 * the next day; a missing or broken end means the start day only; long spans
 * are capped (a typo'd end year must not paint a whole season).
 */
const MAX_DAYS = 31;
const MIN_SPAN_MS = 12 * 60 * 60 * 1000;

function dayKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function eventDayKeys(event: { startTime: string; endTime?: string | null }): string[] {
  const start = parseApiDate(event.startTime);
  if (Number.isNaN(start.getTime())) return [];
  const end = event.endTime ? parseApiDate(event.endTime) : null;
  const last = end && !Number.isNaN(end.getTime()) && end.getTime() - start.getTime() >= MIN_SPAN_MS
    ? new Date(end.getTime() - 1)
    : start;

  const keys: string[] = [];
  const cursor = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const lastDay = new Date(last.getFullYear(), last.getMonth(), last.getDate());
  while (cursor.getTime() <= lastDay.getTime() && keys.length < MAX_DAYS) {
    keys.push(dayKey(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return keys;
}

/** Events filed under every day they cover, in their original order. */
export function groupByEventDays<T extends { startTime: string; endTime?: string | null }>(events: T[]): Map<string, T[]> {
  const byDay = new Map<string, T[]>();
  for (const event of events) {
    for (const key of eventDayKeys(event)) {
      const list = byDay.get(key);
      if (list) list.push(event);
      else byDay.set(key, [event]);
    }
  }
  return byDay;
}

/** Whether `key` is a later day of a multi-day event (the grid says "continuă"). */
export function isContinuationDay(event: { startTime: string; endTime?: string | null }, key: string) {
  const keys = eventDayKeys(event);
  return keys.length > 1 && keys[0] !== key;
}
