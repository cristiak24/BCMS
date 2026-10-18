import { parseApiDate } from './dates';

/**
 * Acasă (player / parent): what the "next activities" list holds. It used to
 * keep trainings only, so a camp in the club's Program never reached a
 * player's home page (audit R3-17). Every non-match type now does, labelled by
 * its type, and a multi-day camp stays listed until it ends rather than
 * disappearing once its first day started. Pure, see homeAgenda.test.ts.
 */

type AgendaEvent = { type: string; startTime: string; endTime: string; status?: string | null };

function time(value: string) {
  const ms = parseApiDate(value).getTime();
  return Number.isNaN(ms) ? null : ms;
}

function isCancelled(event: AgendaEvent) {
  return String(event.status ?? '').toLowerCase() === 'cancelled';
}

/** Started but not over yet (a camp on its second day, a training right now). */
export function isOngoing(event: AgendaEvent, now = Date.now()) {
  const start = time(event.startTime);
  const end = time(event.endTime);
  return start != null && end != null && start <= now && end >= now;
}

/** Trainings, camps, medical and admin entries still ahead (or under way), soonest first. */
export function upcomingActivities<T extends AgendaEvent>(events: T[], now = Date.now()): T[] {
  return events
    .filter((event) => event.type !== 'match' && !isCancelled(event))
    .filter((event) => {
      const start = time(event.startTime);
      const end = time(event.endTime) ?? start;
      return start != null && (start >= now || (end != null && end >= now));
    })
    .sort((a, b) => (time(a.startTime) ?? 0) - (time(b.startTime) ?? 0));
}

const LABELS: Record<string, string> = {
  training: 'Antrenament',
  camp: 'Cantonament',
  medical: 'Vizită medicală',
  admin: 'Administrativ',
  match: 'Meci',
};

export function activityLabel(type: string) {
  return LABELS[type] ?? 'Activitate';
}
