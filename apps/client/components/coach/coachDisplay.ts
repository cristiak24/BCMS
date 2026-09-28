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

/**
 * `fg`/`bg` are the event type's accent — a match is amber, a camp sky, admin
 * purple, a training the brand indigo — so a list of sessions can be scanned
 * by colour before it is read. All token pairs, AA in both themes.
 */
export type EventTypeMeta = { icon: string; label: string; fg: string; bg: string };

export function eventTypeMeta(type: CalendarEvent['type']): EventTypeMeta {
  const label = eventTypeLabel(type);

  switch (type) {
    case 'match':
      return { icon: 'sports-basketball', label, fg: 'var(--c-warning-fg)', bg: 'var(--c-warning-bg)' };
    case 'camp':
      return { icon: 'terrain', label, fg: 'var(--c-sky-fg)', bg: 'var(--c-sky-bg)' };
    case 'admin':
      return { icon: 'badge', label, fg: 'var(--c-purple-fg)', bg: 'var(--c-purple-bg)' };
    default:
      return { icon: 'fitness-center', label, fg: 'var(--c-brand-fg)', bg: 'var(--c-surface-tint)' };
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

/**
 * "Azi" / "Mâine" / "Ieri" / "În 3 zile" for events within a week of today,
 * null otherwise. Calendar days, not 24h windows — a session tomorrow at 09:00
 * seen tonight at 23:00 is "Mâine", not "Azi".
 */
export function formatRelativeDay(value: string, now = new Date()) {
  const date = getEventDate(value);
  if (!date) return null;

  const startOf = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diff = Math.round((startOf(date) - startOf(now)) / 86400000);

  if (diff === 0) return 'Azi';
  if (diff === 1) return 'Mâine';
  if (diff === -1) return 'Ieri';
  if (diff > 1 && diff <= 6) return `În ${diff} zile`;
  return null;
}

/** Soft fill paired with `attendanceRateColor`, for pills and bar tracks. */
export function attendanceRateBg(rate: number | null | undefined) {
  if (rate == null) return 'var(--c-surface-3)';
  if (rate >= 75) return 'var(--c-success-bg)';
  if (rate >= 50) return 'var(--c-warning-bg)';
  return 'var(--c-danger-bg)';
}

/** Solid bar colour for the same scale (the -fg shades are text weights). */
export function attendanceRateBar(rate: number | null | undefined) {
  if (rate == null) return 'var(--c-border-strong)';
  if (rate >= 75) return 'var(--c-success)';
  if (rate >= 50) return 'var(--c-warning)';
  return 'var(--c-danger)';
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
