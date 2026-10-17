import { test } from 'node:test';
import { strict as assert } from 'node:assert';

import { calendarDayToIso, localDateTimeToIso, parseApiDate, toCalendarDay } from './dates';

/** Runs `fn` as a browser in `zone` would; Node re-reads TZ on assignment. */
function inZone(zone: string, fn: () => void) {
  const previous = process.env.TZ;
  process.env.TZ = zone;
  try {
    fn();
  } finally {
    if (previous === undefined) delete process.env.TZ;
    else process.env.TZ = previous;
  }
}

test('parseApiDate: zone-less DB text is UTC, not browser-local (R3-4)', () => {
  inZone('Europe/Bucharest', () => {
    // "Echipa mea" showed an 18:00 training at 15:00 from this exact string.
    const date = parseApiDate('2026-10-16 15:00:00');
    assert.equal(date.toISOString(), '2026-10-16T15:00:00.000Z');
    assert.equal(date.getHours(), 18);
    assert.equal(parseApiDate('2026-10-15 20:14:31.961234').toISOString(), '2026-10-15T20:14:31.961Z');
    assert.equal(parseApiDate('2026-10-16T15:00:00').toISOString(), '2026-10-16T15:00:00.000Z');
  });
});

test('parseApiDate: same as new Date() for ISO, numbers and Dates', () => {
  inZone('Europe/Bucharest', () => {
    assert.equal(parseApiDate('2026-10-22T16:00:00.000Z').toISOString(), '2026-10-22T16:00:00.000Z');
    assert.equal(parseApiDate('2026-10-22T19:00:00+03:00').toISOString(), '2026-10-22T16:00:00.000Z');
    assert.equal(parseApiDate(0).getTime(), 0);
    const source = new Date('2026-10-22T16:00:00Z');
    const copy = parseApiDate(source);
    assert.equal(copy.getTime(), source.getTime());
    assert.notEqual(copy, source);
    assert.ok(Number.isNaN(parseApiDate('garbage').getTime()));
    assert.ok(Number.isNaN(parseApiDate(undefined).getTime()));
  });
});

test('localDateTimeToIso: the typed 19:00 is sent with its offset (P0-3)', () => {
  inZone('Europe/Bucharest', () => {
    assert.equal(localDateTimeToIso('2026-10-22', '19:00'), '2026-10-22T16:00:00.000Z'); // summer, +03:00
    assert.equal(localDateTimeToIso('2027-01-14', '19:00'), '2027-01-14T17:00:00.000Z'); // winter, +02:00
  });
  inZone('UTC', () => {
    assert.equal(localDateTimeToIso('2026-10-22', '19:00'), '2026-10-22T19:00:00.000Z');
  });
  assert.equal(localDateTimeToIso('2026-10-22', '25:00'), null);
  assert.equal(localDateTimeToIso('22.10.2026', '19:00'), null);
});

test('toCalendarDay: a visa saved at midnight stays on its day (WP3.3)', () => {
  for (const zone of ['Europe/Bucharest', 'UTC', 'America/New_York']) {
    inZone(zone, () => {
      assert.equal(toCalendarDay('2027-01-01 00:00:00'), '2027-01-01', zone);
      assert.equal(toCalendarDay('2027-01-01T00:00:00.000Z'), '2027-01-01', zone);
      assert.equal(toCalendarDay('2027-01-01T12:00:00.000Z'), '2027-01-01', zone);
      // Romanian midnight stored as UTC (22:00 the day before).
      assert.equal(toCalendarDay('2026-12-31T22:00:00.000Z'), '2027-01-01', zone);
      assert.equal(toCalendarDay('2027-01-01'), '2027-01-01', zone);
    });
  }
  assert.equal(toCalendarDay(null), '');
  assert.equal(toCalendarDay(''), '');
  assert.equal(toCalendarDay('garbage'), '');
});

test('calendarDayToIso: round-trips through toCalendarDay without drifting', () => {
  for (const zone of ['Europe/Bucharest', 'UTC', 'Pacific/Auckland']) {
    inZone(zone, () => {
      for (const day of ['2027-01-01', '2026-03-29', '2026-10-25', '2026-12-31']) {
        const iso = calendarDayToIso(day);
        assert.equal(iso, `${day}T12:00:00.000Z`, zone);
        assert.equal(toCalendarDay(iso), day, zone);
      }
    });
  }
  assert.equal(calendarDayToIso('2026-02-30'), null);
  assert.equal(calendarDayToIso(''), null);
});
