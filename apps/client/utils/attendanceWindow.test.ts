import { test } from 'node:test';
import { strict as assert } from 'node:assert';

import { isAttendanceOpen } from './attendanceWindow';

test('a session can be marked from its day on, Romanian calendar', () => {
  const now = new Date('2026-10-16T09:00:00.000Z');
  assert.equal(isAttendanceOpen('2026-10-25T16:00:00.000Z', now), false);
  assert.equal(isAttendanceOpen('2026-10-16T16:00:00.000Z', now), true);
  assert.equal(isAttendanceOpen('2026-10-08T16:00:00.000Z', now), true);
});

test('just after midnight in Romania the new day is open, even though UTC is still on the old one', () => {
  const now = new Date('2026-10-24T21:30:00.000Z');
  assert.equal(isAttendanceOpen('2026-10-25T16:00:00.000Z', now), true);
  assert.equal(isAttendanceOpen('2026-10-26T16:00:00.000Z', now), false);
});
