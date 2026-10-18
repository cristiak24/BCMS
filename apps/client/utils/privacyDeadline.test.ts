import { test } from 'node:test';
import { strict as assert } from 'node:assert';

import { deadlineLabel } from './privacyDeadline';

test('days left read in Romanian, with "de" from 20 on', () => {
  assert.deepEqual(deadlineLabel(30), { label: '30 de zile rămase', tone: 'neutral' });
  assert.deepEqual(deadlineLabel(12), { label: '12 zile rămase', tone: 'neutral' });
  assert.deepEqual(deadlineLabel(5), { label: '5 zile rămase', tone: 'warning' });
  assert.deepEqual(deadlineLabel(1), { label: 'O zi rămasă', tone: 'danger' });
  assert.deepEqual(deadlineLabel(0), { label: 'Termenul e azi', tone: 'danger' });
});

test('a passed deadline says by how much', () => {
  assert.deepEqual(deadlineLabel(-1), { label: 'Termen depășit cu 1 zi', tone: 'danger' });
  assert.deepEqual(deadlineLabel(-4), { label: 'Termen depășit cu 4 zile', tone: 'danger' });
  assert.equal(deadlineLabel(null).label, 'Fără termen');
});
