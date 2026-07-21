import { test } from 'node:test';
import { strict as assert } from 'node:assert';

import { computeDailyAttendance, getWeeksInMonth, normalizeAttendanceStatus } from './attendanceHelpers';

const sampleEvents = [
  { id: 1, title: 'Morning Training', startTime: '2026-04-01T09:00:00.000Z' },
  { id: 2, title: 'Evening Training', startTime: '2026-04-01T17:00:00.000Z' },
];

test('normalizeAttendanceStatus maps excused and medical correctly', () => {
  assert.equal(normalizeAttendanceStatus('excused'), 'medical');
  assert.equal(normalizeAttendanceStatus('medical'), 'medical');
  assert.equal(normalizeAttendanceStatus('present'), 'present');
  assert.equal(normalizeAttendanceStatus(undefined), 'pending');
});

test('computeDailyAttendance returns no-session when there are no events', () => {
  const result = computeDailyAttendance(7, [], {});

  assert.equal(result.status, 'no-session');
  assert.equal(result.totalEvents, 0);
});

test('computeDailyAttendance marks fully present day correctly', () => {
  const result = computeDailyAttendance(7, sampleEvents, {
    1: [{ playerId: 7, status: 'present' }],
    2: [{ playerId: 7, status: 'present' }],
  });

  assert.equal(result.status, 'present');
  assert.equal(result.presentCount, 2);
});

test('computeDailyAttendance marks excused-only day as medical', () => {
  const result = computeDailyAttendance(7, sampleEvents, {
    1: [{ playerId: 7, status: 'excused' }],
    2: [{ playerId: 7, status: 'medical' }],
  });

  assert.equal(result.status, 'medical');
});

test('computeDailyAttendance marks mixed states as partial', () => {
  const result = computeDailyAttendance(7, sampleEvents, {
    1: [{ playerId: 7, status: 'present' }],
    2: [{ playerId: 7, status: 'excused' }],
  });

  assert.equal(result.status, 'partial');
});

test('computeDailyAttendance keeps fully unmarked day as pending', () => {
  const result = computeDailyAttendance(7, sampleEvents, {
    1: [],
    2: [],
  });

  assert.equal(result.status, 'pending');
});

test('getWeeksInMonth builds monday-first week buckets', () => {
  const weeks = getWeeksInMonth(2026, 3);

  assert.ok(weeks.length >= 4);
  assert.equal(weeks[0].days[0].getDay(), 1);
  assert.ok(weeks.some(week => week.days.some(day => day.getMonth() === 3 && day.getDate() === 1)));
});
