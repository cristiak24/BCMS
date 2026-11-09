import { normalizeRole } from './authSession';

/**
 * Admin pages each limited role may open. The accountant and staff share the
 * admin shell, but every other /admin page is an admin screen: the server
 * refuses its writes (403) and leaves out fields they may not read — the
 * accountant gets no visas, so Vize, Lot and Jucător said „Fără viză” for
 * everyone. A typed or bookmarked link to such a page goes to the role's home
 * instead, as ProtectedRoute does for a role outside its area.
 *
 * Staff keep the schedule and what it leads to: the event, its attendance
 * (read-only, `canMarkAttendance`), live stats and the FRB sheet. L12 is not
 * theirs (the server answers 403).
 */
const ROLE_PAGES: Record<string, string[]> = {
  accountant: ['/admin/finance', '/admin/documents', '/admin/contacts'],
  staff: [
    '/admin/schedule', '/admin/event', '/admin/attendance', '/admin/stats', '/admin/match',
    '/admin/documents', '/admin/contacts',
  ],
};

export function canOpenAdminPage(role: string | null | undefined, pathname: string) {
  const pages = ROLE_PAGES[normalizeRole(role)];
  if (!pages) return true;
  const path = pathname.replace(/\/+$/, '');
  return pages.some((page) => path === page || path.startsWith(`${page}/`));
}
