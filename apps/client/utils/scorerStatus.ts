import { parseApiDate } from './dates';

type PendingEvent = { clientId: string; type: string };

/** Period markers the scorer writes on its own (opening the sheet opens period 1). */
const MARKERS = new Set(['period_start', 'period_end']);

/**
 * Actions the scorer typed that this device still has to send. The automatic
 * "period 1 starts" written on opening made an empty match read "1 acțiune
 * salvată pe telefon" before anyone had tapped anything (audit WP4A/C3).
 */
export function pendingActionCount(events: PendingEvent[], pending: string[]) {
  if (!pending.length) return 0;
  const waiting = new Set(pending);
  return events.filter((event) => waiting.has(event.clientId) && !MARKERS.has(event.type)).length;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * True when a match is opened for scoring more than a day before its start:
 * a match on the 25th was started and finished on the 16th by mistake (audit
 * C1), so the scorer asks first.
 */
export function startsMoreThanADayAhead(startTime: string | null | undefined, now: Date = new Date()) {
  if (!startTime) return false;
  const start = parseApiDate(startTime).getTime();
  return !Number.isNaN(start) && start - now.getTime() > DAY_MS;
}
