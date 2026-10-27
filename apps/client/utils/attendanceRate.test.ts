import { test } from 'node:test';
import { strict as assert } from 'node:assert';

import { ATTENDANCE_PERIOD_LABEL, formatAttendanceRate, formatPercent1, pooledAttendanceRate } from './attendanceRate';

test('a group rate pools sessions; players with nothing marked do not count as 0%', () => {
  const players = [
    { attendanceAttended: 3, attendanceCounted: 4 },
    { attendanceAttended: 1, attendanceCounted: 1 },
    { attendanceAttended: 0, attendanceCounted: 0 },
    {},
  ];
  // 4 of 5 sessions; the old average of player rates gave (75 + 100 + 0 + 0) / 4 = 44%.
  assert.equal(pooledAttendanceRate(players), 80);
  assert.equal(pooledAttendanceRate([{ attendanceAttended: 0, attendanceCounted: 0 }]), null);
  assert.equal(pooledAttendanceRate([]), null);
});

test('the period is named and an empty rate reads as a dash', () => {
  assert.equal(ATTENDANCE_PERIOD_LABEL, 'Ultimele 30 de zile');
  assert.equal(formatAttendanceRate(66.6), '67%');
  assert.equal(formatAttendanceRate(null), '—');
});

test('one-decimal rates use a Romanian comma: „66,7%”, not „66.7%”', () => {
  assert.equal(formatPercent1(66.6667), '66,7%');
  assert.equal(formatPercent1(100), '100,0%');
  assert.equal(formatPercent1(-2.25).replace('\u2212', '-'), '-2,3%');
});
