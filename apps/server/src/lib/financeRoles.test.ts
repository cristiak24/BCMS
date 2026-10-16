import test from 'node:test';
import assert from 'node:assert/strict';
import { canEditFeeSettings, canUseFinance } from './financeRoles';

test('the accountant uses Finanțe but cannot change the fees', () => {
    assert.equal(canUseFinance('accountant'), true);
    assert.equal(canEditFeeSettings('accountant'), false);
    assert.equal(canEditFeeSettings('admin'), true);
    assert.equal(canEditFeeSettings('superadmin'), true);
    assert.equal(canUseFinance('coach'), false);
    assert.equal(canEditFeeSettings('coach'), false);
});
