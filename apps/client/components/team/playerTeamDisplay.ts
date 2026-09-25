/**
 * Display helpers shared by the two player-side "Echipa mea" screens (team
 * picker and team detail). Kept out of the screens themselves so the event
 * icons, date format and attendance wording can't drift between them.
 */

export type EventTypeMeta = { icon: string; label: string };

export function eventTypeMeta(type: string): EventTypeMeta {
  switch (type) {
    case 'match':
      return { icon: 'sports-basketball', label: 'Meci' };
    case 'camp':
      return { icon: 'terrain', label: 'Cantonament' };
    case 'admin':
      return { icon: 'badge', label: 'Administrativ' };
    case 'medical':
      return { icon: 'medical-services', label: 'Medical' };
    default:
      return { icon: 'fitness-center', label: 'Antrenament' };
  }
}

export function formatEventDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('ro-RO', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

export function formatEventDay(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('ro-RO', { day: '2-digit', month: 'short' }).format(date);
}

export function formatEventTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('ro-RO', { hour: '2-digit', minute: '2-digit' }).format(date);
}

/**
 * Wording matches the standalone "Prezență" tab exactly — medical/excused
 * counts as a marked session but not as attended, so the percentage a player
 * sees here can never contradict the one on that screen.
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

export function attendanceRateColor(rate: number | null) {
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
