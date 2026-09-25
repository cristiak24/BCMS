/**
 * Display helpers shared by the three coach screens (panou, echipe, prezență).
 *
 * Mirrors `components/team/playerTeamDisplay.ts` on the player side: the icons,
 * attendance wording and rate thresholds live here so a coach and a player
 * looking at the same session can never be shown two different labels for it.
 *
 * The coach screens used to carry ~30 hard-coded hexes (#0E2041, #F8FBFF,
 * #EBF4FF …) which stayed light-on-light in dark mode. Everything below returns
 * theme tokens instead.
 */

import type { CalendarEvent } from '../../services/eventsApi';
import { eventTypeLabel, getEventDate } from './coachUtils';

export type EventTypeMeta = { icon: string; label: string };

export function eventTypeMeta(type: CalendarEvent['type']): EventTypeMeta {
  const label = eventTypeLabel(type);

  switch (type) {
    case 'match':
      return { icon: 'sports-basketball', label };
    case 'camp':
      return { icon: 'terrain', label };
    case 'admin':
      return { icon: 'badge', label };
    default:
      return { icon: 'fitness-center', label };
  }
}

/** Day tile on an event row: "12 aug" over the start time. */
export function formatCoachDay(value: string) {
  const date = getEventDate(value);
  if (!date) return value;
  return new Intl.DateTimeFormat('ro-RO', { day: '2-digit', month: 'short' }).format(date);
}

/**
 * Same wording and same buckets the player sees on their own attendance screen —
 * medical/excused counts as marked but not as present.
 */
export function attendanceStatusTone(status?: string | null) {
  const normalized = String(status ?? '').trim().toLowerCase();

  if (normalized === 'present' || normalized === 'prezent') {
    return { label: 'Prezent', bg: 'var(--c-success-bg)', fg: 'var(--c-success-fg)', icon: 'check-circle' as const };
  }
  if (normalized === 'absent') {
    return { label: 'Absent', bg: 'var(--c-danger-bg)', fg: 'var(--c-danger-fg)', icon: 'cancel' as const };
  }
  if (normalized === 'medical' || normalized === 'excused') {
    return { label: 'Motivat', bg: 'var(--c-warning-bg)', fg: 'var(--c-warning-fg)', icon: 'medical-services' as const };
  }
  return { label: 'Nemarcat', bg: 'var(--c-surface-3)', fg: 'var(--c-muted)', icon: 'radio-button-unchecked' as const };
}

export function isPresentStatus(status?: string | null) {
  const normalized = String(status ?? '').trim().toLowerCase();
  return normalized === 'present' || normalized === 'prezent';
}

export function attendanceRateColor(rate: number | null | undefined) {
  if (rate == null) return 'var(--c-faint)';
  if (rate >= 75) return 'var(--c-success-fg)';
  if (rate >= 50) return 'var(--c-warning-fg)';
  return 'var(--c-danger-fg)';
}

export function getInitials(firstName?: string | null, lastName?: string | null) {
  const first = firstName?.trim()?.[0] ?? '';
  const last = lastName?.trim()?.[0] ?? '';
  return `${first}${last}`.toUpperCase() || '?';
}

/** Shirt number when the club records one, initials otherwise. */
export function getPlayerBadge(player: { number?: number | null; firstName?: string | null; lastName?: string | null }) {
  return player.number != null ? `#${player.number}` : getInitials(player.firstName, player.lastName);
}
