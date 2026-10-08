import test from 'node:test';
import assert from 'node:assert/strict';
import { paymentProofHtml } from './paymentProof';

test('proof escapes names and says it is not a fiscal document', () => {
  const html = paymentProofHtml({
    clubName: 'CSM <Test>',
    playerName: 'Matei Ionescu',
    transaction: { id: '42', label: 'Cotizație octombrie 2026', description: 'Plătit de Ioana', amount: 150, currency: 'ron', date: '2026-10-03T10:00:00.000Z' },
  });
  assert.ok(html.includes('CSM &lt;Test&gt;'));
  assert.ok(html.includes('BCMS-42'));
  assert.ok(html.includes('Nu este un document fiscal'));
});
