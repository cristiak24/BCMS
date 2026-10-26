import { test } from 'node:test';
import { strict as assert } from 'node:assert';

import { formatNational, isValidNational, joinPhone, parsePhoneInput } from './phoneInput';

test('Romanian numbers lose the trunk 0 and group by three', () => {
  const parsed = parsePhoneInput('0773 972 431', '+40');
  assert.deepEqual(parsed, { prefix: '+40', national: '773972431' });
  assert.equal(formatNational(parsed.national), '773 972 431');
  assert.equal(joinPhone(parsed.prefix, parsed.national), '+40 773972431');
  assert.equal(isValidNational('+40', parsed.national), true);
  assert.equal(isValidNational('+40', '77397'), false);
});

test('a pasted international number moves the prefix', () => {
  assert.deepEqual(parsePhoneInput('+373 69 123 456', '+40'), { prefix: '+373', national: '69123456' });
  assert.deepEqual(parsePhoneInput('0040773972431', '+40'), { prefix: '+40', national: '773972431' });
  assert.deepEqual(parsePhoneInput('+39 333 1234567', '+40'), { prefix: '+39', national: '3331234567' });
});

test('other countries keep a leading 0 and accept 6–12 digits', () => {
  assert.deepEqual(parsePhoneInput('0151234567', '+49'), { prefix: '+49', national: '0151234567' });
  assert.equal(isValidNational('+49', '1512345'), true);
  assert.equal(isValidNational('+49', '12345'), false);
});
