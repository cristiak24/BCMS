import { test } from 'node:test';
import { strict as assert } from 'node:assert';

import { attendanceOpensAt, isAttendanceOpen } from './attendanceWindow';

test('attendance opens at midnight Romanian time on the day of the session', () => {
    // 25 Oct 2026, 19:00 in Romania (summer time, UTC+3) → opens 24 Oct 21:00 UTC.
    assert.equal(attendanceOpensAt('2026-10-25T16:00:00.000Z')?.toISOString(), '2026-10-24T21:00:00.000Z');
    // Winter time (UTC+2).
    assert.equal(attendanceOpensAt('2026-12-10T17:00:00.000Z')?.toISOString(), '2026-12-09T22:00:00.000Z');
});

test('a session next week cannot be marked; the same day and the past can', () => {
    const now = new Date('2026-10-16T09:00:00.000Z'); // 12:00 in Romania
    assert.equal(isAttendanceOpen('2026-10-25T16:00:00.000Z', now), false);
    assert.equal(isAttendanceOpen('2026-10-16T16:00:00.000Z', now), true, 'later today');
    assert.equal(isAttendanceOpen('2026-10-08T16:00:00.000Z', now), true, 'past');
});

test('just after midnight in Romania (still the previous day in UTC) opens that day', () => {
    // 00:30 on the 25th in Romania = 21:30 UTC on the 24th.
    const now = new Date('2026-10-24T21:30:00.000Z');
    assert.equal(isAttendanceOpen('2026-10-25T16:00:00.000Z', now), true);
    assert.equal(isAttendanceOpen('2026-10-26T16:00:00.000Z', now), false);
});

test('an event without a usable start stays markable', () => {
    assert.equal(isAttendanceOpen(null), true);
});
