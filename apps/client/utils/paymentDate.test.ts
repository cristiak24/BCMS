import { test } from 'node:test';
import { strict as assert } from 'node:assert';

import { formatPaymentWhen, isDefaultDeskDescription, paymentMethodLabel } from './paymentDate';

test('a cash payment shows its day only — no "03:00"', () => {
  const text = formatPaymentWhen('2026-10-12T00:00:00.000Z', 'cash');
  assert.ok(!/\d{2}:\d{2}/.test(text), text);
  assert.match(text, /12/);
});

test('a card payment keeps its time, in Romanian time', () => {
  const text = formatPaymentWhen('2026-10-12T11:05:00.000Z', 'stripe');
  assert.match(text, /14:05/);
});

test('every desk method has a name, so a transfer no longer shows none', () => {
  assert.equal(paymentMethodLabel('cash'), 'numerar');
  assert.equal(paymentMethodLabel('transfer'), 'transfer bancar');
  assert.equal(paymentMethodLabel('card'), 'card (POS)');
  assert.equal(paymentMethodLabel('stripe'), 'card online');
  assert.equal(paymentMethodLabel(null), null);
});

test('a note that only repeats the method is not shown twice in the storno summary', () => {
  assert.equal(isDefaultDeskDescription('Transfer', 'transfer'), true);
  assert.equal(isDefaultDeskDescription('Plată numerar', 'cash'), true);
  assert.equal(isDefaultDeskDescription('chitanța 12', 'cash'), false);
});
