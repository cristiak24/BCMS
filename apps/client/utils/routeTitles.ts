import { tr } from '../i18n';
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
  ['/', tr('Basketball Club Management System')],
  ['/login', tr('Autentificare')],
  ['/signup', tr('Creează cont')],
  ['/profile', tr('Profil')],
  ['/invite/:token', tr('Invitație')],
  ['/termeni', tr('Termeni și condiții')],
  ['/confidentialitate', tr('Politica de confidențialitate')],
  ['/cookie-uri', tr('Cookie-uri')],

  ['/myclub', tr('Acasă')],
  ['/account', tr('Profil')],
  ['/attendance', tr('Prezență')],
  ['/documents', tr('Documente')],
  ['/contacts', tr('Contacte')],
  ['/stats/:id', tr('Statistică meci')],
  ['/payments', tr('Plăți')],
  ['/schedule', tr('Program')],
  ['/team', tr('Echipa mea')],
  ['/team/:id', tr('Echipa mea')],

  ['/coach', tr('Acasă')],
  ['/coach/dashboard', tr('Acasă')],
  ['/coach/teams', tr('Echipe')],
  ['/coach/team/:id', tr('Echipă')],
  ['/coach/attendance', tr('Prezență')],
  ['/coach/l12', tr('L12')],
  ['/coach/requests', tr('Cereri')],
  ['/coach/stats/:id', tr('Statistică meci')],
  ['/coach/l12/match/:id', tr('L12 · Meci')],
  ['/coach/l12/team/:id', tr('L12 · Echipă')],

  ['/admin', tr('Acasă')],
  ['/admin/dashboard', tr('Acasă')],
  ['/admin/roster', tr('Lot')],
  ['/admin/schedule', tr('Program')],
  ['/admin/requests', tr('Cereri')],
  ['/admin/user-access', tr('Acces utilizatori')],
  ['/admin/create-club-admin', tr('Admin club nou')],
  ['/admin/create-account', tr('Cont nou')],
  ['/admin/manage-access', tr('Acces & invitații')],
  ['/admin/manage-accounts', tr('Conturi')],
  ['/admin/my-club-admin', tr('Clubul meu')],
  ['/admin/myclub', tr('Clubul meu')],
  ['/admin/finance', tr('Finanțe')],
  ['/admin/compliance', tr('Conformitate')],
  ['/admin/team/:id', tr('Echipă')],
  ['/admin/event/:id', tr('Eveniment')],
  ['/admin/match/:id', tr('Fișă meci')],
  ['/admin/l12', tr('L12')],
  ['/admin/documents', tr('Documente')],
  ['/admin/contacts', tr('Contacte')],
  ['/admin/stats/:id', tr('Statistică meci')],
  ['/admin/l12/match/:id', tr('L12 · Meci')],
  ['/admin/l12/team/:id', tr('L12 · Echipă')],
  ['/admin/attendance/:id', tr('Prezență')],
  ['/admin/player/:id', tr('Jucător')],
  ['/admin/users', tr('Utilizatori')],
  ['/admin/users/:id', tr('Utilizator')],
  ['/admin/audit-log', tr('Jurnal')],
  ['/admin/privacy', tr('Date personale')],

  ['/super-admin', tr('Super admin')],
  ['/super-admin/dashboard', tr('Super admin')],
  ['/super-admin/clubs', tr('Cluburi')],
  ['/super-admin/clubs/:id', tr('Club')],
  ['/super-admin/users', tr('Utilizatori')],
  ['/super-admin/billing', tr('Facturare')],
  ['/super-admin/create-user', tr('Invită utilizator')],
  ['/super-admin/audit-logs', tr('Jurnal')],
  ['/super-admin/settings', tr('Setări')],
  ['/super-admin/privacy', tr('Cereri date personale')],
  ['/super-admin/invite/:token', tr('Invitație')],
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
  if (!match) return tr('Pagină negăsită · {APP_NAME}', { APP_NAME });
  if (match[0] === '/') return `${APP_NAME} · ${match[1]}`;
  return `${match[1]} · ${APP_NAME}`;
}
