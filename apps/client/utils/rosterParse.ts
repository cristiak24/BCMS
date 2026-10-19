/**
 * A pasted roster ("Popescu Matei 2016", one per line, from Excel or a chat)
 * → rows for POST /teams/:id/players/bulk. Numbering, tabs and separators are
 * dropped; a 4-digit year anywhere on the line is the birth year.
 */

/** Which word is the family name — Romanian lists are usually "Nume Prenume". */
export type RosterOrder = 'last-first' | 'first-last';
export type ParsedRosterRow = { firstName: string; lastName: string; birthYear: number | null };

/**
 * Birth years the server keeps (routes/teams.ts, bulk add): a player is 3 to
 * 39 years old. Anything else is stored as "no year".
 */
export function birthYearRange(now = new Date()) {
  const thisYear = now.getFullYear();
  return { min: thisYear - 39, max: thisYear - 3 };
}

function isPlausibleBirthYear(year: number) {
  const { min, max } = birthYearRange();
  return year >= min && year <= max;
}

type ParsedLine = { row: ParsedRosterRow; typedYear: number | null };

function parseLines(text: string, order: RosterOrder): ParsedLine[] {
  return text
    .split(/\r?\n/)
    .map((line) => line
      .replace(/^\s*\d+\s*[.)-]\s*/, '') // "1. ", "2) ", "3 - "
      .replace(/[\t;,]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim())
    .filter(Boolean)
    .map((line) => {
      // Any 4-digit number is the year that was typed — "1850" too, so it can
      // be reported as ignored rather than vanish.
      const yearMatch = line.match(/\b\d{4}\b/);
      const year = yearMatch ? Number(yearMatch[0]) : null;
      const words = line.replace(/\b\d{4}\b/, '').replace(/\d+/g, '').trim().split(' ').filter(Boolean);
      if (words.length < 2) return null;
      const [lastName, firstName] = order === 'last-first'
        ? [words[0], words.slice(1).join(' ')]
        : [words[words.length - 1], words.slice(0, -1).join(' ')];
      return {
        row: { firstName, lastName, birthYear: year && isPlausibleBirthYear(year) ? year : null },
        typedYear: year,
      };
    })
    .filter((line): line is ParsedLine => line != null)
    .slice(0, 60);
}

export function parseRosterLines(text: string, order: RosterOrder): ParsedRosterRow[] {
  return parseLines(text, order).map((line) => line.row);
}

/**
 * Rows whose typed birth year is out of range and will be saved without one —
 * shown as a warning instead of silently becoming "Vârstă nespecificată".
 */
export function ignoredBirthYears(text: string, order: RosterOrder) {
  return parseLines(text, order)
    .filter((line) => line.typedYear != null && line.row.birthYear == null)
    .map((line) => ({ name: `${line.row.lastName} ${line.row.firstName}`, year: line.typedYear as number }));
}

/**
 * A new player's name prefilled from what was searched for ("Popescu Matei
 * 2016" → Nume, Prenume, An), so "Creează jucător" after an empty search
 * doesn't make the user type it again.
 */
export function playerDraftFromSearch(query: string): { firstName: string; lastName: string; birthYear: string } {
  const [line] = parseLines(query, 'last-first');
  if (line) {
    return { lastName: line.row.lastName, firstName: line.row.firstName, birthYear: line.typedYear ? String(line.typedYear) : '' };
  }
  const yearMatch = query.match(/\b\d{4}\b/);
  const word = query.replace(/\d+/g, '').trim().split(/\s+/).filter(Boolean)[0] ?? '';
  return { lastName: word, firstName: '', birthYear: yearMatch ? yearMatch[0] : '' };
}
