/**
 * The menu section a detail page belongs to. Echipă, Jucător, Eveniment,
 * Prezență and Statistici had no highlighted item in the sidebar or bottom bar
 * (their paths share no prefix with a menu href), so nothing said where you
 * were. Only the menus use this; the header keeps the page's own title.
 */
const DETAIL_PARENTS: [prefix: string, section: string][] = [
  ['/admin/team/', '/admin/my-club-admin'],
  ['/admin/player/', '/admin/roster'],
  ['/admin/event/', '/admin/schedule'],
  ['/admin/attendance/', '/admin/schedule'],
  ['/admin/stats/', '/admin/schedule'],
  ['/admin/match/', '/admin/schedule'],
];

export function navSectionPath(pathname: string) {
  return DETAIL_PARENTS.find(([prefix]) => pathname.startsWith(prefix))?.[1] ?? pathname;
}
