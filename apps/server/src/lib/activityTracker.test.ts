import '../test/pgliteEnv';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shouldRecord, sweepActivity } from './activityTracker';

const TEN_MINUTES = 10 * 60 * 1000;

test('sweeping drops only entries that no longer throttle anything', () => {
    const now = Date.UTC(2026, 9, 17, 12);
    const entries = new Map([
        [1, { at: now - TEN_MINUTES - 1, day: '2026-10-17' }],
        [2, { at: now - 1_000, day: '2026-10-17' }],
    ]);
    assert.equal(sweepActivity(now, entries), 1);
    assert.deepEqual(Array.from(entries.keys()), [2]);
});

test('a swept account is written on its next visit, exactly as with a stale entry', () => {
    const now = Date.UTC(2026, 9, 17, 12);
    const stale = { at: now - TEN_MINUTES, day: '2026-10-17' };
    assert.equal(shouldRecord(stale, now, '2026-10-17'), true);
    assert.equal(shouldRecord(undefined, now, '2026-10-17'), true);
});
