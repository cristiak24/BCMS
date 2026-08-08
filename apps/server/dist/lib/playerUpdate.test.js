"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = require("node:test");
const node_assert_1 = require("node:assert");
const playerUpdate_1 = require("./playerUpdate");
(0, node_test_1.test)('drops fields that are not on the whitelist', () => {
    const result = (0, playerUpdate_1.buildPlayerUpdate)({
        firstName: 'Andrei',
        teamId: 99,
        clubId: 7,
        id: 1234,
        passwordHash: 'x',
    });
    node_assert_1.strict.equal(result.ok, true);
    node_assert_1.strict.ok(result.ok);
    node_assert_1.strict.deepEqual(result.data, { firstName: 'Andrei' });
    node_assert_1.strict.equal('teamId' in result.data, false);
    node_assert_1.strict.equal('clubId' in result.data, false);
    node_assert_1.strict.equal('id' in result.data, false);
});
(0, node_test_1.test)('rejects a body that carries only non-whitelisted fields', () => {
    // The important part: this must not fall through to an empty UPDATE that
    // silently reports success.
    const result = (0, playerUpdate_1.buildPlayerUpdate)({ teamId: 42 });
    node_assert_1.strict.equal(result.ok, false);
    node_assert_1.strict.ok(!result.ok);
    node_assert_1.strict.match(result.error, /No updatable fields/);
});
(0, node_test_1.test)('trims text fields', () => {
    const result = (0, playerUpdate_1.buildPlayerUpdate)({ firstName: '  Ana  ', lastName: 'Pop ' });
    node_assert_1.strict.ok(result.ok);
    node_assert_1.strict.deepEqual(result.data, { firstName: 'Ana', lastName: 'Pop' });
});
(0, node_test_1.test)('rejects non-string values for text fields', () => {
    const result = (0, playerUpdate_1.buildPlayerUpdate)({ firstName: { $ne: null } });
    node_assert_1.strict.ok(!result.ok);
    node_assert_1.strict.match(result.error, /firstName must be a string/);
});
(0, node_test_1.test)('rejects over-long text fields', () => {
    const result = (0, playerUpdate_1.buildPlayerUpdate)({ name: 'a'.repeat(121) });
    node_assert_1.strict.ok(!result.ok);
    node_assert_1.strict.match(result.error, /at most 120 characters/);
});
(0, node_test_1.test)('validates player status against the allowed set', () => {
    node_assert_1.strict.ok((0, playerUpdate_1.buildPlayerUpdate)({ status: 'active' }).ok);
    node_assert_1.strict.ok((0, playerUpdate_1.buildPlayerUpdate)({ status: 'injured' }).ok);
    const invalid = (0, playerUpdate_1.buildPlayerUpdate)({ status: 'superadmin' });
    node_assert_1.strict.ok(!invalid.ok);
    node_assert_1.strict.match(invalid.error, /not a valid player status/);
});
(0, node_test_1.test)('validates email format', () => {
    node_assert_1.strict.ok((0, playerUpdate_1.buildPlayerUpdate)({ email: 'a@b.ro' }).ok);
    const invalid = (0, playerUpdate_1.buildPlayerUpdate)({ email: 'not-an-email' });
    node_assert_1.strict.ok(!invalid.ok);
    node_assert_1.strict.match(invalid.error, /not a valid address/);
});
(0, node_test_1.test)('accepts and normalises jersey number, including explicit null', () => {
    const set = (0, playerUpdate_1.buildPlayerUpdate)({ number: '23' });
    node_assert_1.strict.ok(set.ok);
    node_assert_1.strict.equal(set.data.number, 23);
    const cleared = (0, playerUpdate_1.buildPlayerUpdate)({ number: null });
    node_assert_1.strict.ok(cleared.ok);
    node_assert_1.strict.equal(cleared.data.number, null);
});
(0, node_test_1.test)('rejects out-of-range jersey numbers', () => {
    for (const value of [-1, 1000, 1.5, 'abc']) {
        const result = (0, playerUpdate_1.buildPlayerUpdate)({ number: value });
        node_assert_1.strict.ok(!result.ok, `expected ${String(value)} to be rejected`);
    }
});
(0, node_test_1.test)('rejects out-of-range birth years', () => {
    node_assert_1.strict.ok((0, playerUpdate_1.buildPlayerUpdate)({ birthYear: 2008 }).ok);
    node_assert_1.strict.ok(!(0, playerUpdate_1.buildPlayerUpdate)({ birthYear: 1800 }).ok);
    node_assert_1.strict.ok(!(0, playerUpdate_1.buildPlayerUpdate)({ birthYear: new Date().getFullYear() + 1 }).ok);
});
(0, node_test_1.test)('normalises medicalCheckExpiry to ISO and allows clearing it', () => {
    const set = (0, playerUpdate_1.buildPlayerUpdate)({ medicalCheckExpiry: '2026-09-01' });
    node_assert_1.strict.ok(set.ok);
    node_assert_1.strict.equal(set.data.medicalCheckExpiry, new Date('2026-09-01').toISOString());
    const cleared = (0, playerUpdate_1.buildPlayerUpdate)({ medicalCheckExpiry: null });
    node_assert_1.strict.ok(cleared.ok);
    node_assert_1.strict.equal(cleared.data.medicalCheckExpiry, null);
    const invalid = (0, playerUpdate_1.buildPlayerUpdate)({ medicalCheckExpiry: 'not-a-date' });
    node_assert_1.strict.ok(!invalid.ok);
    node_assert_1.strict.match(invalid.error, /not a valid date/);
});
(0, node_test_1.test)('handles null and undefined bodies without throwing', () => {
    node_assert_1.strict.ok(!(0, playerUpdate_1.buildPlayerUpdate)(null).ok);
    node_assert_1.strict.ok(!(0, playerUpdate_1.buildPlayerUpdate)(undefined).ok);
});
