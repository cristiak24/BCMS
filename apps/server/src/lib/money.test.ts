import test from 'node:test';
import assert from 'node:assert/strict';
import { fitsMoneyColumn, MAX_MONEY_AMOUNT, roundMoney } from './money';

test('keeps bani, rounds to two decimals', () => {
    assert.equal(roundMoney(49.5), 49.5);
    assert.equal(roundMoney(1.005), 1.01);
    assert.equal(roundMoney(0.1 + 0.2), 0.3);
    assert.equal(roundMoney(150), 150);
});

test('amounts beyond numeric(12,2) are rejected before they reach the database', () => {
    assert.equal(fitsMoneyColumn(150), true);
    assert.equal(fitsMoneyColumn(MAX_MONEY_AMOUNT), true);
    assert.equal(fitsMoneyColumn(99999999999), false);
    assert.equal(fitsMoneyColumn(Number.POSITIVE_INFINITY), false);
    assert.equal(fitsMoneyColumn(Number.NaN), false);
});
