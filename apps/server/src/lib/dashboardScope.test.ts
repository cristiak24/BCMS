import { test } from 'node:test';
import { strict as assert } from 'node:assert';

import { dashboardSettingsRowId, resolveDashboardClubScope } from './dashboardScope';

test('superadmin aggregates over every club', () => {
    assert.deepEqual(resolveDashboardClubScope({ role: 'superadmin', clubId: null }), { kind: 'all' });
    // A superadmin who also happens to carry a club id still sees everything.
    assert.deepEqual(resolveDashboardClubScope({ role: 'superadmin', clubId: 4 }), { kind: 'all' });
});

test('club staff are scoped to their own club, whether the id is a number or a string', () => {
    assert.deepEqual(resolveDashboardClubScope({ role: 'admin', clubId: 3 }), { kind: 'club', clubId: 3 });
    assert.deepEqual(resolveDashboardClubScope({ role: 'accountant', clubId: '3' }), { kind: 'club', clubId: 3 });
    assert.deepEqual(resolveDashboardClubScope({ role: 'coach', clubId: 7 }), { kind: 'club', clubId: 7 });
});

test('a non-superadmin without a club sees nothing, never every club', () => {
    assert.deepEqual(resolveDashboardClubScope({ role: 'admin', clubId: null }), { kind: 'none' });
    assert.deepEqual(resolveDashboardClubScope({ role: 'coach', clubId: undefined }), { kind: 'none' });
    assert.deepEqual(resolveDashboardClubScope({ role: 'admin', clubId: 'abc' }), { kind: 'none' });
    assert.deepEqual(resolveDashboardClubScope({ role: 'admin', clubId: 0 }), { kind: 'none' });
    assert.deepEqual(resolveDashboardClubScope(null), { kind: 'none' });
});

test('financial settings are read from the caller club row, not the legacy row 1', () => {
    assert.equal(dashboardSettingsRowId({ kind: 'club', clubId: 5 }), 5);
    assert.equal(dashboardSettingsRowId({ kind: 'all' }), null);
    assert.equal(dashboardSettingsRowId({ kind: 'none' }), null);
});
