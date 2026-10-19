import { test } from 'node:test';
import { strict as assert } from 'node:assert';

import { pendingActionCount, startsMoreThanADayAhead } from './scorerStatus';

test('an empty match with only the automatic period start has nothing "saved on the phone"', () => {
  const events = [{ clientId: 'p1', type: 'period_start' }];
  assert.equal(pendingActionCount(events, ['p1']), 0);
});

test('typed actions still waiting are counted; sent ones and markers are not', () => {
  const events = [
    { clientId: 'p1', type: 'period_start' },
    { clientId: 'a', type: 'p2' },
    { clientId: 'b', type: 'foul' },
    { clientId: 'e', type: 'period_end' },
  ];
  assert.equal(pendingActionCount(events, ['p1', 'a', 'b', 'e']), 2);
  assert.equal(pendingActionCount(events, ['b']), 1);
  assert.equal(pendingActionCount(events, []), 0);
});

test('a match more than a day ahead asks before the scorer opens', () => {
  const now = new Date('2026-10-16T09:00:00.000Z');
  assert.equal(startsMoreThanADayAhead('2026-10-25T08:00:00.000Z', now), true);
  assert.equal(startsMoreThanADayAhead('2026-10-17T08:00:00.000Z', now), false, 'tomorrow morning is under 24h');
  assert.equal(startsMoreThanADayAhead('2026-10-16T08:00:00.000Z', now), false, 'already started');
  assert.equal(startsMoreThanADayAhead(null, now), false);
});
