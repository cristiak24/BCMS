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
