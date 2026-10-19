import { test } from 'node:test';
import { strict as assert } from 'node:assert';

import { canManageEvents, canMarkAttendance } from './eventPermissions';

test('the accountant reads events and attendance but changes neither', () => {
  assert.equal(canManageEvents('accountant'), false);
  assert.equal(canMarkAttendance('accountant'), false);
});

test('admins manage events; coaches mark attendance (their teams, checked by the server)', () => {
  assert.equal(canManageEvents('admin'), true);
  assert.equal(canManageEvents('superadmin'), true);
  assert.equal(canManageEvents('manager'), false, 'the server never accepted "manager" for events');
  assert.equal(canMarkAttendance('coach'), true);
  assert.equal(canMarkAttendance('parent'), false);
});
