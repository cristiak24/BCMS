import { test } from 'node:test';
import { strict as assert } from 'node:assert';

import { computeComplianceMetrics } from '../components/compliance/complianceMetrics';

function daysFromNow(days: number) {
  return new Date(Date.now() + days * 86400000).toISOString();
}

test('an empty roster reports 0%, never 100%', () => {
  const metrics = computeComplianceMetrics([]);

  assert.equal(metrics.total, 0);
  assert.equal(metrics.securePercent, 0);
  assert.equal(metrics.pendingReviews, 0);
});

test('buckets players by medical check state', () => {
  const metrics = computeComplianceMetrics([
    { medicalCheckExpiry: daysFromNow(-10) },  // expired
    { medicalCheckExpiry: daysFromNow(-1) },   // expired
    { medicalCheckExpiry: daysFromNow(10) },   // due soon (<= 30d)
    { medicalCheckExpiry: daysFromNow(200) },  // valid
    { medicalCheckExpiry: null },              // missing
  ]);

  assert.equal(metrics.total, 5);
  assert.equal(metrics.expired, 2);
  assert.equal(metrics.dueSoon, 1);
  assert.equal(metrics.valid, 1);
  assert.equal(metrics.missing, 1);
});

test('securePercent counts only long-valid checks', () => {
  const metrics = computeComplianceMetrics([
    { medicalCheckExpiry: daysFromNow(200) },
    { medicalCheckExpiry: daysFromNow(200) },
    { medicalCheckExpiry: daysFromNow(-5) },
    { medicalCheckExpiry: daysFromNow(200) },
  ]);

  assert.equal(metrics.securePercent, 75);
});

test('pendingReviews covers expired, due-soon and missing', () => {
  const metrics = computeComplianceMetrics([
    { medicalCheckExpiry: daysFromNow(-5) },
    { medicalCheckExpiry: daysFromNow(5) },
    { medicalCheckExpiry: undefined },
    { medicalCheckExpiry: daysFromNow(400) },
  ]);

  assert.equal(metrics.pendingReviews, 3);
});

test('an unparseable expiry date counts as missing, not valid', () => {
  const metrics = computeComplianceMetrics([{ medicalCheckExpiry: 'not-a-date' }]);

  assert.equal(metrics.missing, 1);
  assert.equal(metrics.valid, 0);
  assert.equal(metrics.securePercent, 0);
});
