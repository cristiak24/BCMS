import { test } from 'node:test';
import { strict as assert } from 'node:assert';

import { birthYearRange, ignoredBirthYears, parseRosterLines, playerDraftFromSearch } from './rosterParse';

test('parses "Nume Prenume An" lines with numbering and separators', () => {
  const rows = parseRosterLines('1. Popescu Matei 2016\n2) Ionescu Ana-Maria\t2017\n\n3 - Stan Radu Andrei;2015', 'last-first');
  assert.deepEqual(rows, [
    { firstName: 'Matei', lastName: 'Popescu', birthYear: 2016 },
    { firstName: 'Ana-Maria', lastName: 'Ionescu', birthYear: 2017 },
    { firstName: 'Radu Andrei', lastName: 'Stan', birthYear: 2015 },
  ]);
});

test('first-last order takes the last word as family name', () => {
  assert.deepEqual(parseRosterLines('Matei Andrei Popescu', 'first-last'), [{ firstName: 'Matei Andrei', lastName: 'Popescu', birthYear: null }]);
});

test('single words and implausible years are dropped', () => {
  assert.deepEqual(parseRosterLines('Popescu\nIonescu Ana 1950', 'last-first'), [{ firstName: 'Ana', lastName: 'Ionescu', birthYear: null }]);
});

test('a typed birth year that will not be kept is reported, not dropped silently', () => {
  const text = 'Ionescu Ana 1850\nPopescu Matei 2016\nStan Radu';
  assert.deepEqual(ignoredBirthYears(text, 'last-first'), [{ name: 'Ionescu Ana', year: 1850 }]);
  assert.deepEqual(ignoredBirthYears('Popescu Matei 2016', 'last-first'), []);
});

test('the search text prefills a new player', () => {
  assert.deepEqual(playerDraftFromSearch('Popescu Matei 2016'), { lastName: 'Popescu', firstName: 'Matei', birthYear: '2016' });
  assert.deepEqual(playerDraftFromSearch('popescu'), { lastName: 'popescu', firstName: '', birthYear: '' });
  assert.deepEqual(playerDraftFromSearch('  '), { lastName: '', firstName: '', birthYear: '' });
});

test('the birth year range matches the server (3 to 39 years old)', () => {
  assert.deepEqual(birthYearRange(new Date(2026, 9, 16)), { min: 1987, max: 2023 });
});
