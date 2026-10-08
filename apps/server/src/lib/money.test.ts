import test from 'node:test';
import assert from 'node:assert/strict';
import { roundMoney } from './money';

test('keeps bani, rounds to two decimals', () => {
    assert.equal(roundMoney(49.5), 49.5);
    assert.equal(roundMoney(1.005), 1.01);
    assert.equal(roundMoney(0.1 + 0.2), 0.3);
    assert.equal(roundMoney(150), 150);
});
