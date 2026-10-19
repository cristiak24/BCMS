import test from 'node:test';
import assert from 'node:assert/strict';
import { eventDayKeys, groupByEventDays, isContinuationDay } from './eventDays';

// Bucharest wall clock, written with its offset (October = UTC+3).
const at = (local: string) => new Date(`${local}+03:00`).toISOString();

test('a camp covers every day from its start to its end', () => {
  assert.deepEqual(eventDayKeys({ startTime: at('2026-10-21T09:00:00'), endTime: at('2026-10-24T17:00:00') }),
    ['2026-10-21', '2026-10-22', '2026-10-23', '2026-10-24']);
});

test('an evening session stays on its day; an end at midnight does not spill over', () => {
  assert.deepEqual(eventDayKeys({ startTime: at('2026-10-21T18:00:00'), endTime: at('2026-10-21T19:30:00') }), ['2026-10-21']);
  assert.deepEqual(eventDayKeys({ startTime: at('2026-10-21T22:00:00'), endTime: at('2026-10-22T00:00:00') }), ['2026-10-21']);
  // A late match that ends after midnight is still one evening.
  assert.deepEqual(eventDayKeys({ startTime: at('2026-10-21T23:00:00'), endTime: at('2026-10-22T00:30:00') }), ['2026-10-21']);
  // An overnight trip of 12 hours or more does span both days.
  assert.deepEqual(eventDayKeys({ startTime: at('2026-10-21T20:00:00'), endTime: at('2026-10-22T09:00:00') }), ['2026-10-21', '2026-10-22']);
});

test('no end, an end before the start, or a runaway end are handled', () => {
  assert.deepEqual(eventDayKeys({ startTime: at('2026-10-21T18:00:00'), endTime: null }), ['2026-10-21']);
  assert.deepEqual(eventDayKeys({ startTime: at('2026-10-21T18:00:00'), endTime: at('2026-10-20T18:00:00') }), ['2026-10-21']);
  assert.equal(eventDayKeys({ startTime: at('2026-10-21T18:00:00'), endTime: at('2027-10-21T18:00:00') }).length, 31);
});

test('grouping files a camp under each of its days, and marks the later ones', () => {
  const camp = { id: 1, startTime: at('2026-10-30T09:00:00'), endTime: at('2026-11-01T12:00:00') };
  const training = { id: 2, startTime: at('2026-10-31T18:00:00'), endTime: at('2026-10-31T19:00:00') };
  const byDay = groupByEventDays([camp, training]);
  assert.deepEqual(byDay.get('2026-10-30')?.map((e) => e.id), [1]);
  assert.deepEqual(byDay.get('2026-10-31')?.map((e) => e.id), [1, 2]);
  assert.deepEqual(byDay.get('2026-11-01')?.map((e) => e.id), [1]);
  assert.equal(isContinuationDay(camp, '2026-10-30'), false);
  assert.equal(isContinuationDay(camp, '2026-10-31'), true);
});
