"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = require("node:test");
const node_assert_1 = require("node:assert");
const settingsAudit_1 = require("./settingsAudit");
const CREATED_AT = '2026-01-10T10:00:00.000Z';
const REFERENCE = {
    monthlyPlayerFee: 250,
    trainingLevy: 40,
    facilityFee: 60,
    paymentDueDay: 25,
};
function at(offsetMs) {
    return new Date(new Date(CREATED_AT).getTime() + offsetMs).toISOString();
}
function club(clubId, firestore, postgres = null) {
    return { clubId, firestore, postgres };
}
(0, node_test_1.test)('fees matching the reference and written at club creation are LIKELY_CONTAMINATED', () => {
    const result = (0, settingsAudit_1.classifySettings)(REFERENCE, club(5, Object.assign(Object.assign({}, REFERENCE), { updatedAt: at(2000) })), CREATED_AT);
    node_assert_1.strict.equal(result.bucket, 'LIKELY_CONTAMINATED');
    node_assert_1.strict.equal(result.contamination, 'LIKELY_CONTAMINATED');
    node_assert_1.strict.equal(result.storeMismatch, false);
    node_assert_1.strict.equal(result.source, 'firestore');
});
(0, node_test_1.test)('fees matching the reference but written much later are POSSIBLY_CONTAMINATED', () => {
    const result = (0, settingsAudit_1.classifySettings)(REFERENCE, club(5, Object.assign(Object.assign({}, REFERENCE), { updatedAt: at(45 * 24 * 60 * 60 * 1000) })), CREATED_AT);
    node_assert_1.strict.equal(result.bucket, 'POSSIBLY_CONTAMINATED');
});
(0, node_test_1.test)('any fee differing from the reference is CLEAN', () => {
    const result = (0, settingsAudit_1.classifySettings)(REFERENCE, club(5, Object.assign(Object.assign({}, REFERENCE), { facilityFee: 61, updatedAt: at(1000) })), CREATED_AT);
    node_assert_1.strict.equal(result.bucket, 'CLEAN');
});
(0, node_test_1.test)('a club with no settings in either store is NO_SETTINGS', () => {
    const result = (0, settingsAudit_1.classifySettings)(REFERENCE, club(5, null, null), CREATED_AT);
    node_assert_1.strict.equal(result.bucket, 'NO_SETTINGS');
    node_assert_1.strict.equal(result.source, 'none');
});
(0, node_test_1.test)('stores that disagree are grouped as STORE_MISMATCH without losing the verdict', () => {
    const result = (0, settingsAudit_1.classifySettings)(REFERENCE, club(5, Object.assign(Object.assign({}, REFERENCE), { updatedAt: at(1000) }), Object.assign(Object.assign({}, REFERENCE), { monthlyPlayerFee: 999, updatedAt: at(1000) })), CREATED_AT);
    node_assert_1.strict.equal(result.bucket, 'STORE_MISMATCH');
    node_assert_1.strict.equal(result.storeMismatch, true);
    // The contamination finding survives so the operator sees both facts at once.
    node_assert_1.strict.equal(result.contamination, 'LIKELY_CONTAMINATED');
});
(0, node_test_1.test)('one store simply having no copy is not a mismatch', () => {
    const result = (0, settingsAudit_1.classifySettings)(REFERENCE, club(5, Object.assign(Object.assign({}, REFERENCE), { updatedAt: at(1000) }), null), CREATED_AT);
    node_assert_1.strict.equal(result.storeMismatch, false);
    node_assert_1.strict.equal(result.bucket, 'LIKELY_CONTAMINATED');
});
(0, node_test_1.test)('null, undefined and zero fees are never treated as equal', () => {
    node_assert_1.strict.equal((0, settingsAudit_1.amountsEqual)(null, 0), false);
    node_assert_1.strict.equal((0, settingsAudit_1.amountsEqual)(undefined, 0), false);
    node_assert_1.strict.equal((0, settingsAudit_1.amountsEqual)(null, undefined), false);
    node_assert_1.strict.equal((0, settingsAudit_1.amountsEqual)(0, 0), true);
    node_assert_1.strict.equal((0, settingsAudit_1.amountsEqual)(null, null), true);
    node_assert_1.strict.equal((0, settingsAudit_1.normalizeAmount)(undefined), undefined);
    node_assert_1.strict.equal((0, settingsAudit_1.normalizeAmount)(null), null);
    node_assert_1.strict.equal((0, settingsAudit_1.normalizeAmount)(0), 0);
    // A club with an unset fee must not read as contaminated by a reference of 0.
    const result = (0, settingsAudit_1.classifySettings)({ monthlyPlayerFee: 0, trainingLevy: 0, facilityFee: 0 }, club(5, { monthlyPlayerFee: null, trainingLevy: null, facilityFee: null, updatedAt: at(0) }), CREATED_AT);
    node_assert_1.strict.equal(result.bucket, 'CLEAN');
});
(0, node_test_1.test)('string and number fee values compare as the same amount', () => {
    node_assert_1.strict.equal((0, settingsAudit_1.amountsEqual)('50', 50), true);
    node_assert_1.strict.equal((0, settingsAudit_1.amountsEqual)('50', 51), false);
    node_assert_1.strict.equal((0, settingsAudit_1.amountsEqual)('  50  ', 50), true);
    const result = (0, settingsAudit_1.classifySettings)(REFERENCE, club(5, { monthlyPlayerFee: '250', trainingLevy: '40', facilityFee: '60', updatedAt: at(0) }), CREATED_AT);
    node_assert_1.strict.equal(result.bucket, 'LIKELY_CONTAMINATED');
});
(0, node_test_1.test)('unreadable fee values never match anything, including each other', () => {
    node_assert_1.strict.equal((0, settingsAudit_1.amountsEqual)('abc', 'abc'), false);
    node_assert_1.strict.equal((0, settingsAudit_1.amountsEqual)('', 0), false);
    node_assert_1.strict.equal((0, settingsAudit_1.amountsEqual)('abc', 250), false);
});
(0, node_test_1.test)('club 1 is excluded from contamination classification', () => {
    const result = (0, settingsAudit_1.classifySettings)(REFERENCE, club(1, Object.assign(Object.assign({}, REFERENCE), { updatedAt: at(0) })), CREATED_AT);
    node_assert_1.strict.equal(result.bucket, 'REFERENCE_CLUB');
    node_assert_1.strict.equal(result.contamination, 'NOT_APPLICABLE');
});
(0, node_test_1.test)('the 5 minute proximity boundary is inclusive', () => {
    // Stated rule: distance <= 5 min counts as seeded. Exactly on the boundary flags,
    // because a needless human look is cheaper than leaving wrong fees billing.
    const onBoundary = (0, settingsAudit_1.classifySettings)(REFERENCE, club(5, Object.assign(Object.assign({}, REFERENCE), { updatedAt: at(settingsAudit_1.SEED_PROXIMITY_MS) })), CREATED_AT);
    node_assert_1.strict.equal(onBoundary.bucket, 'LIKELY_CONTAMINATED');
    const justPast = (0, settingsAudit_1.classifySettings)(REFERENCE, club(5, Object.assign(Object.assign({}, REFERENCE), { updatedAt: at(settingsAudit_1.SEED_PROXIMITY_MS + 1) })), CREATED_AT);
    node_assert_1.strict.equal(justPast.bucket, 'POSSIBLY_CONTAMINATED');
    // Clock skew that lands the write just before creation still reads as seeded.
    const skewed = (0, settingsAudit_1.classifySettings)(REFERENCE, club(5, Object.assign(Object.assign({}, REFERENCE), { updatedAt: at(-30000) })), CREATED_AT);
    node_assert_1.strict.equal(skewed.bucket, 'LIKELY_CONTAMINATED');
});
(0, node_test_1.test)('a missing timestamp downgrades a fee match to POSSIBLY_CONTAMINATED', () => {
    const result = (0, settingsAudit_1.classifySettings)(REFERENCE, club(5, Object.assign({}, REFERENCE)), CREATED_AT);
    node_assert_1.strict.equal(result.bucket, 'POSSIBLY_CONTAMINATED');
    node_assert_1.strict.match(result.reason, /timestamp/);
});
(0, node_test_1.test)('a missing reference fingerprint reports CLEAN with an explicit reason, not a silent pass', () => {
    const result = (0, settingsAudit_1.classifySettings)(null, club(5, Object.assign(Object.assign({}, REFERENCE), { updatedAt: at(0) })), CREATED_AT);
    node_assert_1.strict.equal(result.bucket, 'CLEAN');
    node_assert_1.strict.match(result.reason, /No reference fingerprint/);
});
