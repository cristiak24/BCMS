import { normalizeRole } from './authSession';

/**
 * Who may change events and attendance, mirroring the server
 * (eventsController ensureTeamAccess): club admins and the superadmin, plus a
 * coach on their own teams. The accountant shares the admin shell but only
 * reads here — buttons the server would refuse are not offered (WP7-E6).
 */
export function canManageEvents(role: string | null | undefined) {
  return ['admin', 'superadmin'].includes(normalizeRole(role));
}

export function canMarkAttendance(role: string | null | undefined) {
  return canManageEvents(role) || normalizeRole(role) === 'coach';
}
