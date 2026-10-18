import test from 'node:test';
import assert from 'node:assert/strict';
import { attendanceSummary, attendanceSummaryFromCounts, isAttendedStatus, isCountedStatus } from './attendanceRate';

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

test('counts per status (SQL GROUP BY) give the same summary as the rows they count', () => {
    const rows = ['present', 'Present ', 'late', 'absent', 'excused', 'medical', 'prezent', 'absent'].map((status) => ({ status }));
    const buckets = new Map<string, number>();
    rows.forEach((row) => buckets.set(row.status, (buckets.get(row.status) ?? 0) + 1));
    assert.deepEqual(
        attendanceSummaryFromCounts(Array.from(buckets, ([status, count]) => ({ status, count }))),
        attendanceSummary(rows),
    );
    assert.deepEqual(attendanceSummaryFromCounts([]), { attended: 0, counted: 0, rate: null });
});
