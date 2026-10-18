/**
 * One CSV cell / file for every export in the app.
 *
 * A cell that starts with = + - @ (or a tab / carriage return) is read by
 * Excel, LibreOffice and Sheets as a formula: a player named
 * `=HYPERLINK("http://evil.test","Click")` became a live link in the roster
 * export. Such cells are prefixed with an apostrophe so they stay text.
 * Plain numbers (including negative ones) are left alone.
 *
 * Semicolon-separated with CRLF lines by default: Excel with a Romanian locale
 * splits on ";" (comma files landed in one column) and reads "," as the decimal
 * mark, so numeric cells are written 152,5 rather than 152.5.
 */

const FORMULA_START = /^[=+\-@\t\r]/;
const PLAIN_NUMBER = /^[-+]?\d+(?:[.,]\d+)?$/;

export type CsvValue = string | number | boolean | null | undefined;

export const CSV_SEPARATOR = ';';

export function csvCell(value: CsvValue, separator = CSV_SEPARATOR): string {
  let text = value == null ? '' : typeof value === 'number' && separator === ';' ? String(value).replace('.', ',') : String(value);
  if (typeof value !== 'number' && FORMULA_START.test(text) && !PLAIN_NUMBER.test(text)) {
    text = `'${text}`;
  }
  // A comma inside a ";" file ("Pop, Ion", "152,5") is plain text there.
  const needsQuotes = /["\n\r]/.test(text) || text.includes(separator);
  return needsQuotes ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(rows: CsvValue[][], separator = CSV_SEPARATOR, lineBreak = '\r\n'): string {
  return rows.map((row) => row.map((value) => csvCell(value, separator)).join(separator)).join(lineBreak);
}
