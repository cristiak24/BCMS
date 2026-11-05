/**
 * App language for player, parent and coach accounts.
 *
 * Romanian is the source language: every string in the code is Romanian and
 * goes through `t()`, which looks it up in the English dictionary when the
 * user chose English and falls back to the Romanian text when a phrase has no
 * translation yet. Admin and super admin screens stay Romanian.
 *
 * The language is read once at start-up (localStorage, then the profile) and a
 * change reloads the page, so `t()` is a plain function: it works in
 * components, helpers and module-level constants alike.
 */
export type Lang = 'ro' | 'en';

const STORAGE_KEY = 'bcms.lang';
type Dictionary = Record<string, string>;

function readStoredLang(): Lang {
  try {
    if (typeof localStorage === 'undefined') return 'ro';
    return localStorage.getItem(STORAGE_KEY) === 'en' ? 'en' : 'ro';
  } catch {
    return 'ro';
  }
}

let current: Lang = readStoredLang();
let dictionary: Dictionary | null = null;

export function normalizeLang(value: string | null | undefined): Lang {
  return String(value ?? '').trim().toLowerCase().startsWith('en') ? 'en' : 'ro';
}

export function getLang(): Lang {
  return current;
}

/** The BCP 47 locale for Intl date and number formatting. */
export function appLocale(): string {
  return current === 'en' ? 'en-GB' : 'ro-RO';
}

/** Loads the English dictionary before the app renders, when English is on. */
export async function initI18n(): Promise<void> {
  if (current === 'en' && !dictionary) {
    try {
      dictionary = (await import('./en')).default;
    } catch {
      current = 'ro';
    }
  }
  if (typeof document !== 'undefined') document.documentElement.lang = current;
}

/** For tests and tools: installs a dictionary without the dynamic import. */
export function __setDictionaryForTests(lang: Lang, dict: Dictionary | null) {
  current = lang;
  dictionary = dict;
}

/**
 * Switches the language. Returns true when it changed — the page then reloads
 * so every screen, helper and cached label picks the new language up.
 */
export function setLang(next: Lang, options: { reload?: boolean } = {}): boolean {
  if (next === current) return false;
  let stored = false;
  try {
    if (typeof localStorage !== 'undefined') {
      if (next === 'ro') localStorage.removeItem(STORAGE_KEY);
      else localStorage.setItem(STORAGE_KEY, next);
      stored = readStoredLang() === next;
    }
  } catch {
    // Storage blocked: the page can't come back in the new language after a
    // reload, so don't reload (that would loop). Labels switch on next start.
  }
  current = next;
  if (stored && options.reload !== false && typeof window !== 'undefined') window.location.reload();
  return true;
}

type Vars = Record<string, string | number | null | undefined>;

function fill(text: string, vars?: Vars): string {
  if (!vars) return text;
  return text.replace(/\{(\w+)\}/g, (whole, name: string) => {
    const value = vars[name];
    return value === undefined || value === null ? whole : String(value);
  });
}

/**
 * Translates a Romanian phrase. Placeholders are written `{name}`:
 * `t('Restul prezenți ({count})', { count: 4 })`.
 */
export function t(source: string, vars?: Vars): string {
  if (current === 'en' && dictionary) {
    const hit = dictionary[source];
    if (hit !== undefined) return fill(hit, vars);
  }
  return fill(source, vars);
}

/** Roles that can choose a language; everyone else sees Romanian. */
export function roleCanChooseLanguage(role: string | null | undefined): boolean {
  return role === 'player' || role === 'parent' || role === 'coach';
}

/** Short alias used across screens (`t` is often a local name for a team or time). */
export const tr = t;

const RO_MONTHS = ['ianuarie', 'februarie', 'martie', 'aprilie', 'mai', 'iunie', 'iulie', 'august', 'septembrie', 'octombrie', 'noiembrie', 'decembrie'];
const EN_MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** Phrases the server builds (fee titles, due notes, payment notes), as patterns. */
const SERVER_PATTERNS: Array<[RegExp, string]> = [
  [/^Scadent în (\d+) zile$/, 'Scadent în {0} zile'],
  [/^Plătit de (.+)$/, 'Plătit de {0}'],
  [/^Încasat de (.+)$/, 'Încasat de {0}'],
  [/^(.+?) (ianuarie|februarie|martie|aprilie|mai|iunie|iulie|august|septembrie|octombrie|noiembrie|decembrie) (\d{4})$/i, '{0} {1} {2}'],
];

/**
 * Translates text the server wrote in Romanian (fee titles such as
 * „Cotizație octombrie 2026”, „Scadent în 11 zile”). Text the club typed
 * itself (event titles, custom fees) comes back unchanged.
 */
export function trServer(text: string | null | undefined): string {
  if (text == null) return '';
  if (current !== 'en' || !dictionary) return text;
  if (dictionary[text] !== undefined) return dictionary[text];
  for (const [pattern, key] of SERVER_PATTERNS) {
    const match = pattern.exec(text);
    if (!match) continue;
    const groups = match.slice(1).map((value) => {
      const month = RO_MONTHS.indexOf(value.toLowerCase());
      if (month >= 0) return EN_MONTHS[month];
      return dictionary?.[value] ?? value;
    });
    if (key === '{0} {1} {2}') return `${groups[0]}, ${groups[1]} ${groups[2]}`;
    return t(key, Object.fromEntries(groups.map((value, index) => [String(index), value])));
  }
  return text;
}
