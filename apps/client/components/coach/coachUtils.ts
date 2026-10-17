import { parseApiDate } from '@/utils/dates';
import type { CalendarEvent } from '../../services/eventsApi';
import type { AuthUser } from '../../utils/authSession';
import { filterCoachEvents } from '../../utils/coachEventScope';

export function getEventDate(value: string) {
  const date = parseApiDate(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function getEventTimestamp(event: CalendarEvent) {
  return getEventDate(event.startTime)?.getTime() ?? 0;
}

export function isCancelled(event: CalendarEvent) {
  return String(event.status ?? '').toLowerCase() === 'cancelled';
}

export function isUpcoming(event: CalendarEvent) {
  return !isCancelled(event) && getEventTimestamp(event) >= Date.now();
}

/**
 * The sessions a coach's screens show: their teams' (`team.coachId`), teams
 * with no coach yet, and any session assigned to them — see
 * utils/coachEventScope.ts. Pass the club's teams (`teamsApi.getTeams()`).
 */
export function getCoachScopedEvents(
  events: CalendarEvent[],
  session: AuthUser | null,
  teams: Array<{ id: number; coachId: number | null }>,
) {
  return filterCoachEvents(events.filter((event) => !isCancelled(event)), teams, session?.id);
}

export function formatCoachDate(value: string) {
  const date = getEventDate(value);
  if (!date) {
    return value;
  }

  return new Intl.DateTimeFormat('ro-RO', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
  }).format(date);
}

export function formatCoachTime(value: string) {
  const date = getEventDate(value);
  if (!date) {
    return value;
  }

  return new Intl.DateTimeFormat('ro-RO', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

export function formatCoachTimeRange(start: string, end: string) {
  return `${formatCoachTime(start)} - ${formatCoachTime(end)}`;
}

export function eventTypeLabel(type: CalendarEvent['type']) {
  if (type === 'match') return 'Meci';
  if (type === 'camp') return 'Cantonament';
  if (type === 'admin') return 'Info';
  return 'Antrenament';
}
