import test from 'node:test';
import assert from 'node:assert/strict';
import { parseResolveInput, privacyDaysLeft, privacyDueAt, privacyRequestsPath } from './privacyRequests';

test('the answer is due 30 days after the request', () => {
    assert.equal(privacyDueAt('2026-10-01 09:00:00')?.toISOString(), '2026-10-31T09:00:00.000Z');
    assert.equal(privacyDueAt(null), null);
});

test('days left count down and go negative once the deadline passed', () => {
    const created = '2026-10-01 09:00:00';
    assert.equal(privacyDaysLeft(created, new Date('2026-10-01T09:00:00Z')), 30);
    assert.equal(privacyDaysLeft(created, new Date('2026-10-30T10:00:00Z')), 1);
    assert.equal(privacyDaysLeft(created, new Date('2026-11-03T09:00:00Z')), -3);
    assert.equal(privacyDaysLeft('nonsense'), null);
});

test('admins and the platform open their own list', () => {
    assert.equal(privacyRequestsPath('admin'), '/admin/privacy');
    assert.equal(privacyRequestsPath('superadmin'), '/super-admin/privacy');
});

test('the resolution note is optional, trimmed and bounded', () => {
    assert.deepEqual(parseResolveInput({}), { ok: true, value: { note: null } });
    assert.deepEqual(parseResolveInput({ note: '  Cont  șters ' }), { ok: true, value: { note: 'Cont șters' } });
    assert.equal(parseResolveInput({ note: 5 }).ok, false);
    assert.equal(parseResolveInput({ note: 'x'.repeat(1001) }).ok, false);
});
