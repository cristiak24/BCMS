import { test } from 'node:test';
import { strict as assert } from 'node:assert';

import { formatPaymentWhen } from './paymentDate';

test('a cash payment shows its day only — no "03:00"', () => {
  const text = formatPaymentWhen('2026-10-12T00:00:00.000Z', 'cash');
  assert.ok(!/\d{2}:\d{2}/.test(text), text);
  assert.match(text, /12/);
});

test('a card payment keeps its time, in Romanian time', () => {
  const text = formatPaymentWhen('2026-10-12T11:05:00.000Z', 'stripe');
  assert.match(text, /14:05/);
});
