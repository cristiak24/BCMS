/**
 * The browser tab / history / PWA switcher title for each route. Every page
 * used to be "BCMS", so ten open tabs (or the back-button history) were
 * indistinguishable. One map, applied once in App.tsx.
 *
 * Patterns are matched segment by segment; `:param` matches any one segment.
 * The most specific pattern (most literal segments) wins.
 */
const APP_NAME = 'BCMS';

const ROUTE_TITLES: Array<[string, string]> = [
  ['/', 'Basketball Club Management System'],
  ['/login', 'Autentificare'],
  ['/signup', 'Creează cont'],
  ['/profile', 'Profil'],
  ['/invite/:token', 'Invitație'],
  ['/termeni', 'Termeni și condiții'],
  ['/confidentialitate', 'Politica de confidențialitate'],
  ['/cookie-uri', 'Cookie-uri'],

  ['/myclub', 'Acasă'],
  ['/account', 'Profil'],
  ['/attendance', 'Prezență'],
  ['/documents', 'Documente'],
  ['/contacts', 'Contacte'],
  ['/stats/:id', 'Statistică meci'],
  ['/payments', 'Plăți'],
  ['/schedule', 'Program'],
  ['/team', 'Echipa mea'],
  ['/team/:id', 'Echipa mea'],

  ['/coach', 'Acasă'],
  ['/coach/dashboard', 'Acasă'],
  ['/coach/teams', 'Echipe'],
  ['/coach/team/:id', 'Echipă'],
  ['/coach/attendance', 'Prezență'],
  ['/coach/l12', 'L12'],
  ['/coach/requests', 'Cereri'],
  ['/coach/stats/:id', 'Statistică meci'],
  ['/coach/l12/match/:id', 'L12 · Meci'],
  ['/coach/l12/team/:id', 'L12 · Echipă'],

  ['/admin', 'Acasă'],
  ['/admin/dashboard', 'Acasă'],
  ['/admin/roster', 'Lot'],
  ['/admin/schedule', 'Program'],
  ['/admin/requests', 'Cereri'],
  ['/admin/user-access', 'Acces utilizatori'],
  ['/admin/create-club-admin', 'Admin club nou'],
  ['/admin/create-account', 'Cont nou'],
  ['/admin/manage-access', 'Acces & invitații'],
  ['/admin/manage-accounts', 'Conturi'],
  ['/admin/my-club-admin', 'Clubul meu'],
  ['/admin/myclub', 'Clubul meu'],
  ['/admin/finance', 'Finanțe'],
  ['/admin/compliance', 'Conformitate'],
  ['/admin/team/:id', 'Echipă'],
  ['/admin/event/:id', 'Eveniment'],
  ['/admin/match/:id', 'Fișă meci'],
  ['/admin/l12', 'L12'],
  ['/admin/documents', 'Documente'],
  ['/admin/contacts', 'Contacte'],
  ['/admin/stats/:id', 'Statistică meci'],
  ['/admin/l12/match/:id', 'L12 · Meci'],
  ['/admin/l12/team/:id', 'L12 · Echipă'],
  ['/admin/attendance/:id', 'Prezență'],
  ['/admin/player/:id', 'Jucător'],
  ['/admin/users', 'Utilizatori'],
  ['/admin/users/:id', 'Utilizator'],
  ['/admin/audit-log', 'Jurnal'],
  ['/admin/privacy', 'Date personale'],

  ['/super-admin', 'Super admin'],
  ['/super-admin/dashboard', 'Super admin'],
  ['/super-admin/clubs', 'Cluburi'],
  ['/super-admin/clubs/:id', 'Club'],
  ['/super-admin/users', 'Utilizatori'],
  ['/super-admin/billing', 'Facturare'],
  ['/super-admin/create-user', 'Invită utilizator'],
  ['/super-admin/audit-logs', 'Jurnal'],
  ['/super-admin/settings', 'Setări'],
  ['/super-admin/privacy', 'Cereri date personale'],
  ['/super-admin/invite/:token', 'Invitație'],
];

function segments(path: string) {
  return path.split('/').filter(Boolean);
}

function matches(pattern: string, pathname: string) {
  const want = segments(pattern);
  const have = segments(pathname);
  if (want.length !== have.length) return false;
  return want.every((part, index) => part.startsWith(':') || part === have[index]);
}

/** "Lot · BCMS"; unknown paths read "Pagină negăsită · BCMS". */
export function titleForPath(pathname: string): string {
  const match = ROUTE_TITLES
    .filter(([pattern]) => matches(pattern, pathname))
    .sort(([a], [b]) => segments(b).filter((part) => !part.startsWith(':')).length - segments(a).filter((part) => !part.startsWith(':')).length)[0];
  if (!match) return `Pagină negăsită · ${APP_NAME}`;
  if (match[0] === '/') return `${APP_NAME} · ${match[1]}`;
  return `${match[1]} · ${APP_NAME}`;
}
