import { appLocale, getLang, tr } from '../i18n';
/**
 * Plural agreement for a count and its noun, nouns given in Romanian:
 * 1 sesiune · 2 sesiuni · 19 sesiuni · 20 de sesiuni · 101 sesiuni · 120 de sesiuni.
 *
 * "de" comes in when the last two digits are 00 or 20–99 (0 takes the plain
 * plural: "0 sesiuni"). Counts are grouped the Romanian way (1.250).
 * In English the nouns are translated and only 1 takes the singular.
 */
export function pluralWord(count: number, one: string, many: string): string {
  const n = Math.abs(Math.trunc(count));
  if (n === 1 && Math.abs(count) === 1) return tr(one);
  if (getLang() === 'en') return tr(many);
  const rest = n % 100;
  const de = n !== 0 && (rest === 0 || rest >= 20);
  return `${de ? 'de ' : ''}${many}`;
}

export function plural(count: number, one: string, many: string): string {
  return `${count.toLocaleString(appLocale())} ${pluralWord(count, one, many)}`;
}
