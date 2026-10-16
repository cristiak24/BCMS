/**
 * One CSV cell / file for every export in the app.
 *
 * A cell that starts with = + - @ (or a tab / carriage return) is read by
 * Excel, LibreOffice and Sheets as a formula: a player named
 * `=HYPERLINK("http://evil.test","Click")` became a live link in the roster
 * export. Such cells are prefixed with an apostrophe so they stay text.
 * Plain numbers (including negative ones) are left alone.
 */

const FORMULA_START = /^[=+\-@\t\r]/;
const PLAIN_NUMBER = /^[-+]?\d+(?:[.,]\d+)?$/;

export type CsvValue = string | number | boolean | null | undefined;

export function csvCell(value: CsvValue, separator = ','): string {
  let text = value == null ? '' : String(value);
  if (typeof value !== 'number' && FORMULA_START.test(text) && !PLAIN_NUMBER.test(text)) {
    text = `'${text}`;
  }
  const needsQuotes = text.includes('"') || text.includes(separator) || /[\n\r,;]/.test(text);
  return needsQuotes ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(rows: CsvValue[][], separator = ',', lineBreak = '\n'): string {
  return rows.map((row) => row.map((value) => csvCell(value, separator)).join(separator)).join(lineBreak);
}
