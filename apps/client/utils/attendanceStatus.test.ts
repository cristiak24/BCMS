import { test } from 'node:test';
import { strict as assert } from 'node:assert';

import { ATTENDANCE_MARKS, attendanceMarkMeta, toAttendanceMark } from './attendanceStatus';
import { computeDailyAttendance, normalizeAttendanceStatus } from './attendanceHelpers';

test('the four marks, in the order the buttons show them', () => {
  assert.deepEqual(ATTENDANCE_MARKS.map((m) => m.label), ['Prezent', 'Întârziat', 'Absent', 'Motivat']);
});

test('"Motivat" is one mark: medical and the older excused rows read the same', () => {
  assert.equal(toAttendanceMark('medical'), 'medical');
  assert.equal(toAttendanceMark('excused'), 'medical');
  assert.equal(attendanceMarkMeta('excused')?.label, 'Motivat');
});

test('late and the legacy spelling are recognised; anything else is unmarked', () => {
  assert.equal(toAttendanceMark('late'), 'late');
  assert.equal(attendanceMarkMeta('LATE')?.label, 'Întârziat');
  assert.equal(toAttendanceMark('prezent'), 'present');
  assert.equal(toAttendanceMark('pending'), null);
  assert.equal(toAttendanceMark(null), null);
});

test('the admin grid counts a late arrival as present, not as never marked', () => {
  assert.equal(normalizeAttendanceStatus('late'), 'present');
  assert.equal(normalizeAttendanceStatus('prezent'), 'present');
  const day = computeDailyAttendance(7, [{ id: 1, title: 'Antrenament', startTime: '2026-10-16T15:00:00.000Z' }], {
    1: [{ playerId: 7, status: 'late' }],
  });
  assert.equal(day.status, 'present');
  assert.equal(day.eventDetails[0].status, 'present');
});
