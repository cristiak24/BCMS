import test from 'node:test';
import assert from 'node:assert/strict';
import { collectPaidFeeIds, isOutstandingStatus, parseFeeIds, safeReturnUrl, serializeFeeIds } from './paymentLedger';

test('paid rows settle exactly the fees they list', () => {
    const paid = collectPaidFeeIds([
        { status: 'paid', feeIds: 'levy:2026-10,event:4', month: 10, year: 2026 },
        { status: 'failed', feeIds: 'facility:2026-10', month: 10, year: 2026 },
    ]);
    assert.deepEqual([...paid].sort(), ['event:4', 'levy:2026-10']);
    // A paid event fee no longer settles the month's fee as a side effect.
    assert.equal(paid.has('monthly:2026-10'), false);
});

test('legacy paid rows without fee ids settle their own month', () => {
    const paid = collectPaidFeeIds([{ status: 'succeeded', feeIds: null, month: 9, year: 2026 }]);
    assert.deepEqual([...paid], ['monthly:2026-09']);
});

test('failed and voided rows are not money owed', () => {
    assert.equal(isOutstandingStatus('pending'), true);
    assert.equal(isOutstandingStatus('failed'), false);
    assert.equal(isOutstandingStatus('void'), false);
    assert.equal(isOutstandingStatus('paid'), false);
});

test('fee ids round-trip without duplicates or blanks', () => {
    assert.equal(serializeFeeIds(['a', ' a ', '', 'b']), 'a,b');
    assert.equal(serializeFeeIds([]), null);
    assert.deepEqual(parseFeeIds('x, y,,x'), ['x', 'y']);
});

test('return URL must stay on an allowed origin', () => {
    const allowed = (origin: string) => origin === 'https://bcms.ro';
    assert.equal(safeReturnUrl('https://bcms.ro/payments', 'F', allowed), 'https://bcms.ro/payments');
    assert.equal(safeReturnUrl('https://evil.example/payments', 'F', allowed), 'F');
    assert.equal(safeReturnUrl('javascript:alert(1)', 'F', allowed), 'F');
    assert.equal(safeReturnUrl('/payments', 'F', allowed), 'F');
    assert.equal(safeReturnUrl(undefined, 'F', allowed), 'F');
});
