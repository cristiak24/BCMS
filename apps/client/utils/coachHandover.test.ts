import { test } from 'node:test';
import { strict as assert } from 'node:assert';

import { handoverTarget, NOBODY, readHandoverRequest } from './coachHandover';

test('a 409 coach_has_teams becomes the handover step', () => {
  const error = Object.assign(new Error('Ion antrenează U12.'), {
    status: 409,
    data: { error: 'Ion antrenează U12.', code: 'coach_has_teams', teams: [{ id: 2, name: 'U12' }], candidates: [{ id: 9, name: 'Ana', role: 'coach' }] },
  });
  assert.deepEqual(readHandoverRequest(error), {
    message: 'Ion antrenează U12.',
    teams: [{ id: 2, name: 'U12' }],
    candidates: [{ id: 9, name: 'Ana', role: 'coach' }],
  });
});

test('any other error is not a handover', () => {
  assert.equal(readHandoverRequest(Object.assign(new Error('x'), { status: 409, data: { code: 'other' } })), null);
  assert.equal(readHandoverRequest(Object.assign(new Error('x'), { status: 400, data: { code: 'coach_has_teams', teams: [] } })), null);
  assert.equal(readHandoverRequest(new Error('x')), null);
  assert.equal(readHandoverRequest(null), null);
});

test('"nobody for now" is null, a person is their id', () => {
  assert.equal(handoverTarget(NOBODY), null);
  assert.equal(handoverTarget('9'), 9);
});
