import { test } from 'node:test';
import { strict as assert } from 'node:assert';

import { isoTimestampReplacer, toDate, toIso } from './dateUtils';

/** Runs `fn` with the process in `zone`; Node re-reads TZ on assignment. */
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

const ZONES = ['UTC', 'Europe/Bucharest', 'America/New_York'];

test('toIso: raw DB timestamp text is UTC whatever zone the process runs in', () => {
    for (const zone of ZONES) {
        inZone(zone, () => {
            assert.equal(toIso('2026-10-16 15:00:00'), '2026-10-16T15:00:00.000Z', zone);
            assert.equal(toIso('2026-10-15 20:14:31.961234'), '2026-10-15T20:14:31.961Z', zone);
            assert.equal(toIso('2026-10-16T15:00:00'), '2026-10-16T15:00:00.000Z', zone);
            assert.equal(toIso('2027-01-01 00:00:00'), '2027-01-01T00:00:00.000Z', zone);
        });
    }
});

test('toIso: explicit zones and Date objects are kept as they are', () => {
    inZone('Europe/Bucharest', () => {
        assert.equal(toIso('2026-10-22T19:00:00+03:00'), '2026-10-22T16:00:00.000Z');
        assert.equal(toIso('2026-10-22T16:00:00.000Z'), '2026-10-22T16:00:00.000Z');
        assert.equal(toIso(new Date('2026-10-22T16:00:00Z')), '2026-10-22T16:00:00.000Z');
        assert.equal(toIso('2026-10-22'), '2026-10-22T00:00:00.000Z');
    });
});

test('toDate: empty and garbage input give null', () => {
    assert.equal(toDate(null), null);
    assert.equal(toDate(''), null);
    assert.equal(toDate('not a date'), null);
    assert.equal(toDate('2026-13-45 99:00:00'), null);
});

test('json replacer: raw timestamp text leaves the API as ISO with Z', () => {
    for (const zone of ZONES) {
        inZone(zone, () => {
            const body = JSON.stringify({
                createdAt: '2026-10-15 20:14:31.96',
                nested: [{ lastLoginAt: '2026-10-16 06:00:00' }],
                startTime: '2026-10-16T15:00:00.000Z',
                birthDate: '2016-03-02',
                note: 'antrenament la 19:00',
            }, isoTimestampReplacer);
            assert.deepEqual(JSON.parse(body), {
                createdAt: '2026-10-15T20:14:31.960Z',
                nested: [{ lastLoginAt: '2026-10-16T06:00:00.000Z' }],
                startTime: '2026-10-16T15:00:00.000Z',
                birthDate: '2016-03-02',
                note: 'antrenament la 19:00',
            }, zone);
        });
    }
});
