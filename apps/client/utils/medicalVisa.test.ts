import { test } from 'node:test';
import { strict as assert } from 'node:assert';

import { medicalStatus } from './medicalVisa';

// 20 Oct 2026, 15:00 in Romania.
const NOW = new Date('2026-10-20T12:00:00.000Z');

test('a visa is valid through its expiry day, Romanian calendar', () => {
  assert.equal(medicalStatus('2026-10-20', NOW), 'soon', 'date-only value: still valid today');
  assert.equal(medicalStatus('2026-10-20T00:00:00.000Z', NOW), 'soon', 'stored midnight UTC');
  assert.equal(medicalStatus('2026-10-20 12:00:00', NOW), 'soon', 'zone-less UTC text from the database');
  assert.equal(medicalStatus('2026-10-19', NOW), 'expired');
});

test('soon within 30 days, valid beyond, missing when empty or unreadable', () => {
  assert.equal(medicalStatus('2026-11-19', NOW), 'soon');
  assert.equal(medicalStatus('2026-11-21', NOW), 'valid');
  assert.equal(medicalStatus(null, NOW), 'missing');
  assert.equal(medicalStatus('nu e o dată', NOW), 'missing');
});
