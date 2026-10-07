import test from 'node:test';
import assert from 'node:assert/strict';
import { inviteTtlMinutes } from './inviteTtl';

test('defaults to 7 days', () => {
    assert.equal(inviteTtlMinutes({}), 7 * 24 * 60);
});

test('hours win over the older minutes setting', () => {
    assert.equal(inviteTtlMinutes({ INVITE_TTL_HOURS: '48', INVITE_EXPIRATION_MINUTES: '10' }), 48 * 60);
});

test('a 10-minute setting is raised to the 24-hour floor', () => {
    assert.equal(inviteTtlMinutes({ INVITE_EXPIRATION_MINUTES: '10' }), 24 * 60);
});

test('capped at 30 days', () => {
    assert.equal(inviteTtlMinutes({ INVITE_TTL_HOURS: '10000' }), 30 * 24 * 60);
});
