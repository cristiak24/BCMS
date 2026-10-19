/**
 * The four marks a coach or admin can give a player for one session, shared by
 * the coach "Prezență" screen, the admin sheet and the player's history.
 *
 * "Motivat" is one mark: it is written as `medical`, and the older `excused`
 * rows read as the same thing (counted the same way by the rate — left out of
 * it). "Întârziat" (`late`) counts as attended (server lib/attendanceRate.ts).
 */
export type AttendanceMark = 'present' | 'late' | 'absent' | 'medical';

export type AttendanceMarkMeta = {
  status: AttendanceMark;
  label: string;
  icon: string;
  fg: string;
  bg: string;
  solid: string;
};

export const ATTENDANCE_MARKS: AttendanceMarkMeta[] = [
  { status: 'present', label: 'Prezent', icon: 'check-circle', fg: 'var(--c-success-fg)', bg: 'var(--c-success-bg)', solid: 'var(--c-success)' },
  { status: 'late', label: 'Întârziat', icon: 'access-time', fg: 'var(--c-brand-fg)', bg: 'var(--c-surface-tint)', solid: 'var(--c-brand-fg)' },
  { status: 'absent', label: 'Absent', icon: 'cancel', fg: 'var(--c-danger-fg)', bg: 'var(--c-danger-bg)', solid: 'var(--c-danger)' },
  { status: 'medical', label: 'Motivat', icon: 'medical-services', fg: 'var(--c-warning-fg)', bg: 'var(--c-warning-bg)', solid: 'var(--c-warning)' },
];

const META_BY_MARK = Object.fromEntries(ATTENDANCE_MARKS.map((meta) => [meta.status, meta])) as Record<AttendanceMark, AttendanceMarkMeta>;

/** A stored status as one of the four marks; null = not marked. */
export function toAttendanceMark(raw: string | null | undefined): AttendanceMark | null {
  const value = String(raw ?? '').trim().toLowerCase();
  if (value === 'present' || value === 'prezent') return 'present';
  if (value === 'late') return 'late';
  if (value === 'absent') return 'absent';
  if (value === 'medical' || value === 'excused') return 'medical';
  return null;
}

export function attendanceMarkMeta(raw: string | null | undefined): AttendanceMarkMeta | null {
  const mark = toAttendanceMark(raw);
  return mark ? META_BY_MARK[mark] : null;
}
