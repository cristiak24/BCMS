import test from 'node:test';
import assert from 'node:assert/strict';
import { attendanceSummary, isAttendedStatus, isCountedStatus } from './attendanceRate';

test('late counts as attended; medical and excused stay out of the rate', () => {
    assert.equal(isAttendedStatus('late'), true);
    assert.equal(isCountedStatus('medical'), false);
    assert.equal(isCountedStatus('excused'), false);
    assert.equal(isCountedStatus('absent'), true);
});

test('rate = attended ÷ (attended + absent)', () => {
    const rows = ['present', 'late', 'absent', 'medical', 'excused', 'present'].map((status) => ({ status }));
    assert.deepEqual(attendanceSummary(rows), { attended: 3, counted: 4, rate: 75 });
    assert.equal(attendanceSummary([{ status: 'medical' }]).rate, null);
});

test('one rate for every screen: last 30 days, pooled over marked sessions, whole percent', async () => {
    const { attendancePeriod, attendanceRate } = await import('./attendanceRate');
    const now = new Date('2026-10-17T12:00:00Z');
    const period = attendancePeriod(now);
    const rows = [
        { status: 'present', date: '2026-10-16 15:00:00' },
        { status: 'late', date: '2026-10-10T15:00:00.000Z' },
        { status: 'absent', date: '2026-10-01 15:00:00' },
        { status: 'medical', date: '2026-10-02 15:00:00' },
        // Older than 30 days, in the future, or undated: not in the period.
        { status: 'absent', date: '2026-09-10 15:00:00' },
        { status: 'absent', date: '2026-10-20 15:00:00' },
        { status: 'absent', date: null },
    ];
    assert.deepEqual(attendanceRate(rows, period), { attended: 2, counted: 3, rate: 67 });
    assert.deepEqual(attendanceRate([], period), { attended: 0, counted: 0, rate: null });
});

test('the previous period ends where the current one starts', async () => {
    const { attendancePeriod, attendanceRate } = await import('./attendanceRate');
    const now = new Date('2026-10-17T12:00:00Z');
    const current = attendancePeriod(now);
    const previous = attendancePeriod(now, 1);
    assert.equal(previous.to.getTime(), current.from.getTime());
    const edge = [{ status: 'present', date: current.from.toISOString() }];
    assert.equal(attendanceRate(edge, current).counted + attendanceRate(edge, previous).counted, 1);
});
