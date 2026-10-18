import test from 'node:test';
import assert from 'node:assert/strict';
import { plural, pluralWord } from './plural';

test('1 takes the singular, 2–19 the plain plural', () => {
  assert.equal(plural(1, 'sesiune', 'sesiuni'), '1 sesiune');
  assert.equal(plural(2, 'viză', 'vize'), '2 vize');
  assert.equal(plural(19, 'părinte', 'părinți'), '19 părinți');
  assert.equal(plural(0, 'taxă', 'taxe'), '0 taxe');
});

test('20 and up (by the last two digits) take "de"', () => {
  assert.equal(plural(20, 'sesiune', 'sesiuni'), '20 de sesiuni');
  assert.equal(plural(99, 'taxă', 'taxe'), '99 de taxe');
  assert.equal(plural(100, 'taxă', 'taxe'), '100 de taxe');
  assert.equal(plural(101, 'taxă', 'taxe'), '101 taxe');
  assert.equal(plural(119, 'taxă', 'taxe'), '119 taxe');
  assert.equal(plural(120, 'taxă', 'taxe'), '120 de taxe');
  assert.equal(plural(1250, 'jucător', 'jucători'), '1.250 de jucători');
});

test('the word alone, for "3/20 sesiuni" style fractions', () => {
  assert.equal(pluralWord(1, 'sesiune', 'sesiuni'), 'sesiune');
  assert.equal(pluralWord(5, 'sesiune', 'sesiuni'), 'sesiuni');
  assert.equal(pluralWord(21, 'sesiune', 'sesiuni'), 'de sesiuni');
});
