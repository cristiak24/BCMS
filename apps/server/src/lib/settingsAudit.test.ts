import { test } from 'node:test';
import { strict as assert } from 'node:assert';

import {
    amountsEqual,
    classifySettings,
    normalizeAmount,
    SEED_PROXIMITY_MS,
    type FeeSnapshot,
} from './settingsAudit';

const CREATED_AT = '2026-01-10T10:00:00.000Z';

const REFERENCE: FeeSnapshot = {
    monthlyPlayerFee: 250,
    trainingLevy: 40,
    facilityFee: 60,
    paymentDueDay: 25,
};

function at(offsetMs: number) {
    return new Date(new Date(CREATED_AT).getTime() + offsetMs).toISOString();
}

function club(clubId: number, firestore: FeeSnapshot | null, postgres: FeeSnapshot | null = null) {
    return { clubId, firestore, postgres };
}

test('fees matching the reference and written at club creation are LIKELY_CONTAMINATED', () => {
    const result = classifySettings(
        REFERENCE,
        club(5, { ...REFERENCE, updatedAt: at(2_000) }),
        CREATED_AT,
    );

    assert.equal(result.bucket, 'LIKELY_CONTAMINATED');
    assert.equal(result.contamination, 'LIKELY_CONTAMINATED');
    assert.equal(result.storeMismatch, false);
    assert.equal(result.source, 'firestore');
});

test('fees matching the reference but written much later are POSSIBLY_CONTAMINATED', () => {
    const result = classifySettings(
        REFERENCE,
        club(5, { ...REFERENCE, updatedAt: at(45 * 24 * 60 * 60 * 1000) }),
        CREATED_AT,
    );

    assert.equal(result.bucket, 'POSSIBLY_CONTAMINATED');
});

test('any fee differing from the reference is CLEAN', () => {
    const result = classifySettings(
        REFERENCE,
        club(5, { ...REFERENCE, facilityFee: 61, updatedAt: at(1_000) }),
        CREATED_AT,
    );

    assert.equal(result.bucket, 'CLEAN');
});

test('a club with no settings in either store is NO_SETTINGS', () => {
    const result = classifySettings(REFERENCE, club(5, null, null), CREATED_AT);

    assert.equal(result.bucket, 'NO_SETTINGS');
    assert.equal(result.source, 'none');
});

test('stores that disagree are grouped as STORE_MISMATCH without losing the verdict', () => {
    const result = classifySettings(
        REFERENCE,
        club(
            5,
            { ...REFERENCE, updatedAt: at(1_000) },
            { ...REFERENCE, monthlyPlayerFee: 999, updatedAt: at(1_000) },
        ),
        CREATED_AT,
    );

    assert.equal(result.bucket, 'STORE_MISMATCH');
    assert.equal(result.storeMismatch, true);
    // The contamination finding survives so the operator sees both facts at once.
    assert.equal(result.contamination, 'LIKELY_CONTAMINATED');
});

test('one store simply having no copy is not a mismatch', () => {
    const result = classifySettings(
        REFERENCE,
        club(5, { ...REFERENCE, updatedAt: at(1_000) }, null),
        CREATED_AT,
    );

    assert.equal(result.storeMismatch, false);
    assert.equal(result.bucket, 'LIKELY_CONTAMINATED');
});

test('null, undefined and zero fees are never treated as equal', () => {
    assert.equal(amountsEqual(null, 0), false);
    assert.equal(amountsEqual(undefined, 0), false);
    assert.equal(amountsEqual(null, undefined), false);
    assert.equal(amountsEqual(0, 0), true);
    assert.equal(amountsEqual(null, null), true);

    assert.equal(normalizeAmount(undefined), undefined);
    assert.equal(normalizeAmount(null), null);
    assert.equal(normalizeAmount(0), 0);

    // A club with an unset fee must not read as contaminated by a reference of 0.
    const result = classifySettings(
        { monthlyPlayerFee: 0, trainingLevy: 0, facilityFee: 0 },
        club(5, { monthlyPlayerFee: null, trainingLevy: null, facilityFee: null, updatedAt: at(0) }),
        CREATED_AT,
    );

    assert.equal(result.bucket, 'CLEAN');
});

test('string and number fee values compare as the same amount', () => {
    assert.equal(amountsEqual('50', 50), true);
    assert.equal(amountsEqual('50', 51), false);
    assert.equal(amountsEqual('  50  ', 50), true);

    const result = classifySettings(
        REFERENCE,
        club(5, { monthlyPlayerFee: '250', trainingLevy: '40', facilityFee: '60', updatedAt: at(0) }),
        CREATED_AT,
    );

    assert.equal(result.bucket, 'LIKELY_CONTAMINATED');
});

test('unreadable fee values never match anything, including each other', () => {
    assert.equal(amountsEqual('abc', 'abc'), false);
    assert.equal(amountsEqual('', 0), false);
    assert.equal(amountsEqual('abc', 250), false);
});

test('club 1 is excluded from contamination classification', () => {
    const result = classifySettings(
        REFERENCE,
        club(1, { ...REFERENCE, updatedAt: at(0) }),
        CREATED_AT,
    );

    assert.equal(result.bucket, 'REFERENCE_CLUB');
    assert.equal(result.contamination, 'NOT_APPLICABLE');
});

test('the 5 minute proximity boundary is inclusive', () => {
    // Stated rule: distance <= 5 min counts as seeded. Exactly on the boundary flags,
    // because a needless human look is cheaper than leaving wrong fees billing.
    const onBoundary = classifySettings(
        REFERENCE,
        club(5, { ...REFERENCE, updatedAt: at(SEED_PROXIMITY_MS) }),
        CREATED_AT,
    );
    assert.equal(onBoundary.bucket, 'LIKELY_CONTAMINATED');

    const justPast = classifySettings(
        REFERENCE,
        club(5, { ...REFERENCE, updatedAt: at(SEED_PROXIMITY_MS + 1) }),
        CREATED_AT,
    );
    assert.equal(justPast.bucket, 'POSSIBLY_CONTAMINATED');

    // Clock skew that lands the write just before creation still reads as seeded.
    const skewed = classifySettings(
        REFERENCE,
        club(5, { ...REFERENCE, updatedAt: at(-30_000) }),
        CREATED_AT,
    );
    assert.equal(skewed.bucket, 'LIKELY_CONTAMINATED');
});

test('a missing timestamp downgrades a fee match to POSSIBLY_CONTAMINATED', () => {
    const result = classifySettings(REFERENCE, club(5, { ...REFERENCE }), CREATED_AT);

    assert.equal(result.bucket, 'POSSIBLY_CONTAMINATED');
    assert.match(result.reason, /timestamp/);
});

test('a missing reference fingerprint reports CLEAN with an explicit reason, not a silent pass', () => {
    const result = classifySettings(null, club(5, { ...REFERENCE, updatedAt: at(0) }), CREATED_AT);

    assert.equal(result.bucket, 'CLEAN');
    assert.match(result.reason, /No reference fingerprint/);
});
