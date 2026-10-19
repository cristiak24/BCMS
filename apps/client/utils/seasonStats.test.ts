import { test } from 'node:test';
import { strict as assert } from 'node:assert';

import { formatPct, formatStat, sortSeasonRows } from './seasonStats';

test('averages read the Romanian way; nothing to show is a dash', () => {
  assert.equal(formatStat(8.5), '8,5');
  assert.equal(formatStat(12), '12');
  assert.equal(formatStat(null), '—');
  assert.equal(formatPct(43), '43%');
  assert.equal(formatPct(null), '—');
});

const row = (lastName: string, pts: number | null, reb: number | null, games = 3) => ({
  firstName: 'A', lastName, games, averages: { pts, reb, ast: null }, totals: { pts: (pts ?? 0) * games },
});

test('sorting puts the highest first and rows with no value last', () => {
  const rows = [row('Ionescu', 4, null), row('Popescu', 9.5, 3), row('Avram', 4, 6)];
  assert.deepEqual(sortSeasonRows(rows, 'pts').map((r) => r.lastName), ['Popescu', 'Avram', 'Ionescu']);
  assert.deepEqual(sortSeasonRows(rows, 'reb').map((r) => r.lastName), ['Avram', 'Popescu', 'Ionescu']);
});
