import type { CalendarEvent } from '../../services/eventsApi';
import type { AuthUser } from '../../utils/authSession';

export function getEventDate(value: string) {
  const date = new Date(value);
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

export function getCoachScopedEvents(events: CalendarEvent[], session: AuthUser | null) {
  const coachId = Number(session?.id);
  const activeEvents = events.filter((event) => !isCancelled(event));

  if (!Number.isFinite(coachId)) {
    return activeEvents;
  }

  const assignedEvents = activeEvents.filter((event) => Number(event.coachId) === coachId);
  return assignedEvents.length ? assignedEvents : activeEvents;
}

export function getCoachScopeLabel(events: CalendarEvent[], session: AuthUser | null) {
  const coachId = Number(session?.id);

  if (!Number.isFinite(coachId)) {
    return 'Club sessions';
  }

  return events.some((event) => Number(event.coachId) === coachId) ? 'Assigned sessions' : 'Club sessions';
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
  if (type === 'match') return 'Match';
  if (type === 'camp') return 'Camp';
  if (type === 'admin') return 'Info';
  return 'Training';
}
