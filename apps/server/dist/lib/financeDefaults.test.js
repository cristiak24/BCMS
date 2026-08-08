"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = require("node:test");
const node_assert_1 = require("node:assert");
const financeDefaults_1 = require("./financeDefaults");
(0, node_test_1.test)('a fresh club is seeded with all fees at zero', () => {
    const settings = (0, financeDefaults_1.buildDefaultSettings)(7);
    node_assert_1.strict.equal(settings.monthlyPlayerFee, 0);
    node_assert_1.strict.equal(settings.trainingLevy, 0);
    node_assert_1.strict.equal(settings.facilityFee, 0);
});
(0, node_test_1.test)('a fresh club gets the default due day and auto-adjust enabled', () => {
    const settings = (0, financeDefaults_1.buildDefaultSettings)(7);
    node_assert_1.strict.equal(settings.paymentDueDay, financeDefaults_1.DEFAULT_PAYMENT_DUE_DAY);
    node_assert_1.strict.equal(settings.autoAdjust, 1);
});
(0, node_test_1.test)('a null club id falls back to the legacy row id and a null clubId', () => {
    for (const value of [null, undefined]) {
        const settings = (0, financeDefaults_1.buildDefaultSettings)(value);
        node_assert_1.strict.equal(settings.id, financeDefaults_1.DEFAULT_SETTINGS_ROW_ID);
        node_assert_1.strict.equal(settings.clubId, null);
    }
});
(0, node_test_1.test)('a numeric club id is used as both the row id and the clubId', () => {
    const settings = (0, financeDefaults_1.buildDefaultSettings)(42);
    node_assert_1.strict.equal(settings.id, 42);
    node_assert_1.strict.equal(settings.clubId, 42);
});
(0, node_test_1.test)('the seed carries no value that could have come from another club', () => {
    // The regression this guards: seeding used to read club 1's live Firestore doc and
    // Postgres row and copy its real fees onto the new club. A function that cannot
    // reach a store cannot leak one club's pricing into another's onboarding.
    node_assert_1.strict.equal(financeDefaults_1.buildDefaultSettings.constructor.name, 'Function', 'must not be async');
    const clubOne = (0, financeDefaults_1.buildDefaultSettings)(1);
    const newClub = (0, financeDefaults_1.buildDefaultSettings)(999);
    // Whatever club 1 really charges, a new club's seeded fees are identical to it only
    // in being zero — they are never read from anywhere.
    node_assert_1.strict.deepEqual({
        monthlyPlayerFee: newClub.monthlyPlayerFee,
        trainingLevy: newClub.trainingLevy,
        facilityFee: newClub.facilityFee,
        paymentDueDay: newClub.paymentDueDay,
        autoAdjust: newClub.autoAdjust,
    }, {
        monthlyPlayerFee: clubOne.monthlyPlayerFee,
        trainingLevy: clubOne.trainingLevy,
        facilityFee: clubOne.facilityFee,
        paymentDueDay: clubOne.paymentDueDay,
        autoAdjust: clubOne.autoAdjust,
    });
    node_assert_1.strict.equal(newClub.monthlyPlayerFee, 0);
});
(0, node_test_1.test)('the returned document keeps the shape the finance screen expects', () => {
    const settings = (0, financeDefaults_1.buildDefaultSettings)(3);
    node_assert_1.strict.deepEqual(Object.keys(settings).sort(), [
        'autoAdjust',
        'clubId',
        'facilityFee',
        'id',
        'monthlyPlayerFee',
        'paymentDueDay',
        'trainingLevy',
        'updatedAt',
    ]);
    node_assert_1.strict.ok(settings.updatedAt instanceof Date);
});
