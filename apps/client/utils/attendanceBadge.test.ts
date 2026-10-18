import test from 'node:test';
import assert from 'node:assert/strict';
import { isEliteRhythm } from './attendanceBadge';

test('a perfect rate on one session is not yet an elite rhythm', () => {
  assert.equal(isEliteRhythm(100, 1), false);
  assert.equal(isEliteRhythm(100, 4), false);
});

test('from five marked sessions a 90%+ rate earns the badge', () => {
  assert.equal(isEliteRhythm(100, 5), true);
  assert.equal(isEliteRhythm(90, 12), true);
  assert.equal(isEliteRhythm(89, 12), false);
  assert.equal(isEliteRhythm(null, 12), false);
});
