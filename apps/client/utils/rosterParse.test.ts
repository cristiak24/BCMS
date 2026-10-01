import { test } from 'node:test';
import { strict as assert } from 'node:assert';

import { parseRosterLines } from './rosterParse';

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
