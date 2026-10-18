import test from 'node:test';
import assert from 'node:assert/strict';
import { checkProfileFields } from './profileInput';

test('an empty first or last name is refused; leaving them out is fine', () => {
    assert.deepEqual(checkProfileFields({ firstName: '   ' }), { ok: false, error: 'Prenumele nu poate fi gol.' });
    assert.deepEqual(checkProfileFields({ lastName: '' }), { ok: false, error: 'Numele nu poate fi gol.' });
    assert.deepEqual(checkProfileFields({ firstName: 'Ioana', lastName: 'Popescu' }), { ok: true });
    assert.deepEqual(checkProfileFields({}), { ok: true });
});

test('only the offered languages are stored; clearing the choice is allowed', () => {
    assert.deepEqual(checkProfileFields({ preferredLanguage: 'klingon' }), { ok: false, error: 'Limba aleasă nu este disponibilă.' });
    assert.deepEqual(checkProfileFields({ preferredLanguage: 'ro' }), { ok: true });
    assert.deepEqual(checkProfileFields({ preferredLanguage: 'EN' }), { ok: true });
    assert.deepEqual(checkProfileFields({ preferredLanguage: null }), { ok: true });
    assert.deepEqual(checkProfileFields({ preferredLanguage: '' }), { ok: true });
});
