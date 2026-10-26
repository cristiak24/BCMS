/**
 * Signup phone field: a country prefix (Romania by default) plus the national
 * number typed as digits. The pair is sent as "+40 773972431", which the
 * server's normalizePhone accepts.
 */

export const DEFAULT_PREFIX = '+40';

export const PHONE_PREFIXES = [
  { prefix: '+40', label: 'România +40' },
  { prefix: '+373', label: 'Moldova +373' },
  { prefix: '+39', label: 'Italia +39' },
  { prefix: '+34', label: 'Spania +34' },
  { prefix: '+49', label: 'Germania +49' },
  { prefix: '+33', label: 'Franța +33' },
  { prefix: '+44', label: 'Marea Britanie +44' },
  { prefix: '+43', label: 'Austria +43' },
  { prefix: '+32', label: 'Belgia +32' },
  { prefix: '+31', label: 'Olanda +31' },
  { prefix: '+36', label: 'Ungaria +36' },
  { prefix: '+359', label: 'Bulgaria +359' },
  { prefix: '+30', label: 'Grecia +30' },
  { prefix: '+1', label: 'SUA / Canada +1' },
] as const;

const MAX_TOTAL_DIGITS = 15;

/** Groups of three: 773972431 → "773 972 431". */
export function formatNational(digits: string) {
  return digits.replace(/(\d{3})(?=\d)/g, '$1 ');
}

/**
 * Reads what was typed in the number box. A pasted "+373 …" or "0040 …" moves
 * the prefix; a Romanian "07…" loses its trunk 0, since the prefix replaces it.
 */
export function parsePhoneInput(raw: string, currentPrefix: string): { prefix: string; national: string } {
  let prefix = currentPrefix;
  let text = raw.trim();
  if (text.startsWith('00')) text = `+${text.slice(2)}`;
  if (text.startsWith('+')) {
    const typed = text.replace(/\D/g, '');
    const match = [...PHONE_PREFIXES]
      .map((entry) => entry.prefix)
      .sort((a, b) => b.length - a.length)
      .find((candidate) => typed.startsWith(candidate.slice(1)));
    if (match) {
      prefix = match;
      text = typed.slice(match.length - 1);
    } else {
      text = typed;
    }
  }
  let digits = text.replace(/\D/g, '');
  if (prefix === DEFAULT_PREFIX && digits.startsWith('0')) digits = digits.slice(1);
  return { prefix, national: digits.slice(0, MAX_TOTAL_DIGITS - (prefix.length - 1)) };
}

/** Romania has exactly 9 national digits; elsewhere 6–12. */
export function isValidNational(prefix: string, national: string) {
  if (prefix === DEFAULT_PREFIX) return national.length === 9;
  return national.length >= 6 && national.length <= 12;
}

export function joinPhone(prefix: string, national: string) {
  return `${prefix} ${national}`;
}
