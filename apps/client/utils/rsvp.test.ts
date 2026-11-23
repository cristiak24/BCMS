import test from 'node:test';
import assert from 'node:assert/strict';
import { countsLine, eventTakesResponses, groupStaffRows, responseLabel, responseQuestion, responsesOpen } from './rsvp';

test('the same event rule as the server', () => {
  assert.equal(eventTakesResponses({ type: 'training', teamId: 1 }), true);
  assert.equal(eventTakesResponses({ type: 'camp', teamId: 1, status: 'scheduled' }), true);
  assert.equal(eventTakesResponses({ type: 'admin', teamId: 1 }), false);
  assert.equal(eventTakesResponses({ type: 'match', teamId: null }), false);
  assert.equal(eventTakesResponses({ type: 'match', teamId: 2, status: 'cancelled' }), false);
  assert.equal(eventTakesResponses(null), false);
});

test('open until the start (API text is UTC)', () => {
  const start = '2026-11-25 16:00:00';
  assert.equal(responsesOpen(start, Date.parse('2026-11-25T15:59:00Z')), true);
  assert.equal(responsesOpen(start, Date.parse('2026-11-25T16:00:00Z')), false);
  assert.equal(responsesOpen(null), false);
});

test('labels speak for the player or about them', () => {
  assert.equal(responseLabel('going', 'self'), 'Vin');
  assert.equal(responseLabel('not_going', 'self'), 'Nu vin');
  assert.equal(responseLabel('going', 'third'), 'Vine');
  assert.equal(responseLabel('not_going', 'third'), 'Nu vine');
  assert.equal(responseLabel('maybe', 'third'), 'Poate');
  assert.equal(responseQuestion(), 'Participi?');
  assert.equal(responseQuestion('Matei'), 'Participă Matei?');
});

test('English: „Vin” the answer is not „Vin” the weekday', async () => {
  const { __setDictionaryForTests } = await import('../i18n');
  const { default: en } = await import('../i18n/en');
  __setDictionaryForTests('en', en);
  try {
    assert.equal(responseLabel('going', 'self'), 'Coming');
    assert.equal(responseLabel('not_going', 'third'), 'Not coming');
  } finally {
    __setDictionaryForTests('ro', null);
  }
});

test('counts line and staff groups', () => {
  assert.equal(countsLine({ going: 9, notGoing: 2, maybe: 1, none: 2 }), 'Vin 9 · Nu vin 2 · Poate 1 · Fără răspuns 2');
  const groups = groupStaffRows([{ status: 'going' }, { status: null }, { status: 'not_going' }, { status: 'going' }] as const as Array<{ status: 'going' | 'not_going' | 'maybe' | null }>);
  assert.deepEqual(groups.map((group) => [group.key, group.rows.length]), [['not_going', 1], ['none', 1], ['going', 2]]);
});
