import { test } from 'node:test';
import { strict as assert } from 'node:assert';

import { buildPlayerUpdate } from './playerUpdate';

test('drops fields that are not on the whitelist', () => {
    const result = buildPlayerUpdate({
        firstName: 'Andrei',
        teamId: 99,
        clubId: 7,
        id: 1234,
        passwordHash: 'x',
    });

    assert.equal(result.ok, true);
    assert.ok(result.ok);
    assert.deepEqual(result.data, { firstName: 'Andrei' });
    assert.equal('teamId' in result.data, false);
    assert.equal('clubId' in result.data, false);
    assert.equal('id' in result.data, false);
});

test('rejects a body that carries only non-whitelisted fields', () => {
    // The important part: this must not fall through to an empty UPDATE that
    // silently reports success.
    const result = buildPlayerUpdate({ teamId: 42 });

    assert.equal(result.ok, false);
    assert.ok(!result.ok);
    assert.match(result.error, /No updatable fields/);
});

test('trims text fields', () => {
    const result = buildPlayerUpdate({ firstName: '  Ana  ', lastName: 'Pop ' });

    assert.ok(result.ok);
    assert.deepEqual(result.data, { firstName: 'Ana', lastName: 'Pop' });
});

test('rejects non-string values for text fields', () => {
    const result = buildPlayerUpdate({ firstName: { $ne: null } });

    assert.ok(!result.ok);
    assert.match(result.error, /firstName must be a string/);
});

test('rejects over-long text fields', () => {
    const result = buildPlayerUpdate({ name: 'a'.repeat(121) });

    assert.ok(!result.ok);
    assert.match(result.error, /at most 120 characters/);
});

test('validates player status against the allowed set', () => {
    assert.ok(buildPlayerUpdate({ status: 'active' }).ok);
    assert.ok(buildPlayerUpdate({ status: 'injured' }).ok);

    const invalid = buildPlayerUpdate({ status: 'superadmin' });
    assert.ok(!invalid.ok);
    assert.match(invalid.error, /not a valid player status/);
});

test('validates email format', () => {
    assert.ok(buildPlayerUpdate({ email: 'a@b.ro' }).ok);

    const invalid = buildPlayerUpdate({ email: 'not-an-email' });
    assert.ok(!invalid.ok);
    assert.match(invalid.error, /not a valid address/);
});

test('accepts and normalises jersey number, including explicit null', () => {
    const set = buildPlayerUpdate({ number: '23' });
    assert.ok(set.ok);
    assert.equal(set.data.number, 23);

    const cleared = buildPlayerUpdate({ number: null });
    assert.ok(cleared.ok);
    assert.equal(cleared.data.number, null);
});

test('rejects out-of-range jersey numbers', () => {
    for (const value of [-1, 1000, 1.5, 'abc']) {
        const result = buildPlayerUpdate({ number: value });
        assert.ok(!result.ok, `expected ${String(value)} to be rejected`);
    }
});

test('rejects out-of-range birth years', () => {
    assert.ok(buildPlayerUpdate({ birthYear: 2008 }).ok);
    assert.ok(!buildPlayerUpdate({ birthYear: 1800 }).ok);
    assert.ok(!buildPlayerUpdate({ birthYear: new Date().getFullYear() + 1 }).ok);
});

test('normalises medicalCheckExpiry to ISO and allows clearing it', () => {
    const set = buildPlayerUpdate({ medicalCheckExpiry: '2026-09-01' });
    assert.ok(set.ok);
    assert.equal(set.data.medicalCheckExpiry, new Date('2026-09-01').toISOString());

    const cleared = buildPlayerUpdate({ medicalCheckExpiry: null });
    assert.ok(cleared.ok);
    assert.equal(cleared.data.medicalCheckExpiry, null);

    const invalid = buildPlayerUpdate({ medicalCheckExpiry: 'not-a-date' });
    assert.ok(!invalid.ok);
    assert.match(invalid.error, /not a valid date/);
});

test('handles null and undefined bodies without throwing', () => {
    assert.ok(!buildPlayerUpdate(null).ok);
    assert.ok(!buildPlayerUpdate(undefined).ok);
});
