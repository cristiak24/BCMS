/**
 * A pasted roster ("Popescu Matei 2016", one per line, from Excel or a chat)
 * → rows for POST /teams/:id/players/bulk. Numbering, tabs and separators are
 * dropped; a 4-digit year anywhere on the line is the birth year.
 */

/** Which word is the family name — Romanian lists are usually "Nume Prenume". */
export type RosterOrder = 'last-first' | 'first-last';
export type ParsedRosterRow = { firstName: string; lastName: string; birthYear: number | null };

export function parseRosterLines(text: string, order: RosterOrder): ParsedRosterRow[] {
  const thisYear = new Date().getFullYear();
  return text
    .split(/\r?\n/)
    .map((line) => line
      .replace(/^\s*\d+\s*[.)\-]\s*/, '') // "1. ", "2) ", "3 - "
      .replace(/[\t;,]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim())
    .filter(Boolean)
    .map((line) => {
      const yearMatch = line.match(/\b(19|20)\d{2}\b/);
      const year = yearMatch ? Number(yearMatch[0]) : null;
      const words = line.replace(/\b(19|20)\d{2}\b/, '').replace(/\d+/g, '').trim().split(' ').filter(Boolean);
      if (words.length < 2) return null;
      const [lastName, firstName] = order === 'last-first'
        ? [words[0], words.slice(1).join(' ')]
        : [words[words.length - 1], words.slice(0, -1).join(' ')];
      return {
        firstName,
        lastName,
        birthYear: year && year <= thisYear - 3 && year > thisYear - 40 ? year : null,
      };
    })
    .filter((row): row is ParsedRosterRow => row != null)
    .slice(0, 60);
}
