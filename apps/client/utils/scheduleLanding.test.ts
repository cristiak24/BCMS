import { test } from 'node:test';
import { strict as assert } from 'node:assert';

import { findNextUpcomingEvent, resolveLandingMonth } from './scheduleLanding';

const NOW = new Date('2026-08-04T12:00:00.000Z');

function evt(startTime: unknown) {
    return { startTime };
}

function ym(date: Date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

/** The month `now` falls in, in local time — what "stay put" must resolve to. */
const CURRENT_MONTH = ym(new Date(NOW.getFullYear(), NOW.getMonth(), 1));

test('lands on the month of the next upcoming event', () => {
    const month = resolveLandingMonth([
        evt('2026-06-01T10:00:00.000Z'),
        evt('2026-10-15T18:30:00.000Z'),
        evt('2026-12-02T09:00:00.000Z'),
    ], NOW);

    assert.equal(ym(month), '2026-10');
    assert.equal(month.getDate(), 1);
});

test('REGRESSION: only past events must land on the current month, never the oldest', () => {
    // The 2023 bug. Old code did `find(isUpcoming) ?? visibleEvents[0]` on an ascending
    // list, so with nothing upcoming it selected the oldest event in club history and
    // opened the calendar three years in the past. This asserts the opposite.
    const pastOnly = [
        evt('2023-01-09T10:00:00.000Z'),
        evt('2024-05-20T10:00:00.000Z'),
        evt('2026-07-30T10:00:00.000Z'),
    ];

    const month = resolveLandingMonth(pastOnly, NOW);

    assert.equal(ym(month), CURRENT_MONTH);
    assert.notEqual(ym(month), '2023-01');
    assert.equal(findNextUpcomingEvent(pastOnly, NOW), null);
});

test('an empty event list lands on the current month', () => {
    assert.equal(ym(resolveLandingMonth([], NOW)), CURRENT_MONTH);
});

test('null and undefined input land on the current month without throwing', () => {
    assert.equal(ym(resolveLandingMonth(null, NOW)), CURRENT_MONTH);
    assert.equal(ym(resolveLandingMonth(undefined, NOW)), CURRENT_MONTH);
    assert.equal(findNextUpcomingEvent(null, NOW), null);
});

test('an event exactly at now counts as upcoming (inclusive)', () => {
    // Matches the existing isUpcoming rule: getEventTimestamp(event) >= Date.now().
    const exactly = evt(NOW.toISOString());
    assert.equal(findNextUpcomingEvent([exactly], NOW), exactly);

    const oneMsEarlier = evt(new Date(NOW.getTime() - 1).toISOString());
    assert.equal(findNextUpcomingEvent([oneMsEarlier], NOW), null);
});

test('unsorted input still finds the soonest upcoming event', () => {
    const soonest = evt('2026-09-01T08:00:00.000Z');
    const month = resolveLandingMonth([
        evt('2027-01-20T10:00:00.000Z'),
        evt('2023-03-03T10:00:00.000Z'),
        soonest,
        evt('2026-11-11T10:00:00.000Z'),
    ], NOW);

    assert.equal(ym(month), '2026-09');
});

test('malformed start times are ignored rather than throwing', () => {
    const valid = evt('2026-09-15T10:00:00.000Z');
    const events = [evt('not-a-date'), evt(null), evt(undefined), evt({}), valid];

    assert.equal(findNextUpcomingEvent(events, NOW), valid);
    assert.equal(ym(resolveLandingMonth(events, NOW)), '2026-09');

    // All-malformed must fall back to the current month, not blow up.
    assert.equal(ym(resolveLandingMonth([evt('nonsense'), evt(NaN)], NOW)), CURRENT_MONTH);
});

test('the returned date is always the first of its month at local midnight', () => {
    const month = resolveLandingMonth([evt('2026-10-27T23:45:00.000Z')], NOW);

    assert.equal(month.getDate(), 1);
    assert.equal(month.getHours(), 0);
    assert.equal(month.getMinutes(), 0);
});
