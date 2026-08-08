import { test } from 'node:test';
import { strict as assert } from 'node:assert';

import {
    buildDefaultSettings,
    DEFAULT_PAYMENT_DUE_DAY,
    DEFAULT_SETTINGS_ROW_ID,
} from './financeDefaults';

test('a fresh club is seeded with all fees at zero', () => {
    const settings = buildDefaultSettings(7);

    assert.equal(settings.monthlyPlayerFee, 0);
    assert.equal(settings.trainingLevy, 0);
    assert.equal(settings.facilityFee, 0);
});

test('a fresh club gets the default due day and auto-adjust enabled', () => {
    const settings = buildDefaultSettings(7);

    assert.equal(settings.paymentDueDay, DEFAULT_PAYMENT_DUE_DAY);
    assert.equal(settings.autoAdjust, 1);
});

test('a null club id falls back to the legacy row id and a null clubId', () => {
    for (const value of [null, undefined]) {
        const settings = buildDefaultSettings(value);

        assert.equal(settings.id, DEFAULT_SETTINGS_ROW_ID);
        assert.equal(settings.clubId, null);
    }
});

test('a numeric club id is used as both the row id and the clubId', () => {
    const settings = buildDefaultSettings(42);

    assert.equal(settings.id, 42);
    assert.equal(settings.clubId, 42);
});

test('the seed carries no value that could have come from another club', () => {
    // The regression this guards: seeding used to read club 1's live Firestore doc and
    // Postgres row and copy its real fees onto the new club. A function that cannot
    // reach a store cannot leak one club's pricing into another's onboarding.
    assert.equal(buildDefaultSettings.constructor.name, 'Function', 'must not be async');

    const clubOne = buildDefaultSettings(1);
    const newClub = buildDefaultSettings(999);

    // Whatever club 1 really charges, a new club's seeded fees are identical to it only
    // in being zero — they are never read from anywhere.
    assert.deepEqual(
        {
            monthlyPlayerFee: newClub.monthlyPlayerFee,
            trainingLevy: newClub.trainingLevy,
            facilityFee: newClub.facilityFee,
            paymentDueDay: newClub.paymentDueDay,
            autoAdjust: newClub.autoAdjust,
        },
        {
            monthlyPlayerFee: clubOne.monthlyPlayerFee,
            trainingLevy: clubOne.trainingLevy,
            facilityFee: clubOne.facilityFee,
            paymentDueDay: clubOne.paymentDueDay,
            autoAdjust: clubOne.autoAdjust,
        },
    );

    assert.equal(newClub.monthlyPlayerFee, 0);
});

test('the returned document keeps the shape the finance screen expects', () => {
    const settings = buildDefaultSettings(3);

    assert.deepEqual(Object.keys(settings).sort(), [
        'autoAdjust',
        'clubId',
        'facilityFee',
        'id',
        'monthlyPlayerFee',
        'paymentDueDay',
        'trainingLevy',
        'updatedAt',
    ]);
    assert.ok(settings.updatedAt instanceof Date);
});
