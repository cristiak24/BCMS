import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isContactStaff, normalizePhone, parsePlayerContact } from './contacts';

test('only admins and coaches see family numbers', () => {
    assert.equal(isContactStaff('coach'), true);
    assert.equal(isContactStaff('admin'), true);
    assert.equal(isContactStaff('parent'), false);
    assert.equal(isContactStaff('accountant'), false);
});

test('phone numbers accept the usual Romanian formats', () => {
    for (const value of ['0722 123 456', '+40 722 123 456', '0722-123-456', '(0237) 123.456']) {
        const result = normalizePhone(value, 'T');
        assert.ok(result.ok && result.value === value.replace(/\s+/g, ' ').trim(), value);
    }
});

test('phone numbers reject text and absurd lengths; blank clears', () => {
    assert.equal(normalizePhone('call me', 'T').ok, false);
    assert.equal(normalizePhone('12', 'T').ok, false);
    assert.equal(normalizePhone('+40 722 123 456 789 012', 'T').ok, false);
    const blank = normalizePhone('   ', 'T');
    assert.ok(blank.ok && blank.value === null);
});

test('player contact payload is cleaned field by field', () => {
    const result = parsePlayerContact({ phone: '', guardianName: '  Ana   Pop ', guardianPhone: '0744 000 111', guardian2Phone: null });
    assert.ok(result.ok);
    if (!result.ok) return;
    assert.deepEqual(result.value, { phone: null, guardianName: 'Ana Pop', guardianPhone: '0744 000 111', guardian2Name: null, guardian2Phone: null });
    assert.equal(parsePlayerContact({ guardian2Phone: 'abc' }).ok, false);
});
