import test from 'node:test';
import assert from 'node:assert/strict';
import { canOpenAdminPage } from './adminPages';

test('the club admin and the superadmin open every admin page', () => {
  for (const role of ['admin', 'superadmin']) {
    assert.equal(canOpenAdminPage(role, '/admin/roster'), true);
    assert.equal(canOpenAdminPage(role, '/admin/player/2'), true);
    assert.equal(canOpenAdminPage(role, '/admin/l12/match/6'), true);
  }
});

test('the accountant keeps finance, documents and contacts only', () => {
  assert.equal(canOpenAdminPage('accountant', '/admin/finance'), true);
  assert.equal(canOpenAdminPage('accountant', '/admin/finance/'), true);
  assert.equal(canOpenAdminPage('accountant', '/admin/documents'), true);
  assert.equal(canOpenAdminPage('accountant', '/admin/contacts'), true);
  for (const path of ['/admin', '/admin/dashboard', '/admin/roster', '/admin/player/2', '/admin/compliance', '/admin/schedule', '/admin/l12', '/admin/manage-accounts', '/admin/privacy']) {
    assert.equal(canOpenAdminPage('accountant', path), false, path);
  }
});

test('a prefix does not open a longer page name', () => {
  assert.equal(canOpenAdminPage('accountant', '/admin/finance-export'), false);
  assert.equal(canOpenAdminPage('staff', '/admin/events'), false);
});

test('staff keep the schedule and the pages it leads to', () => {
  for (const path of ['/admin/schedule', '/admin/event/1', '/admin/attendance/1', '/admin/stats/6', '/admin/match/5', '/admin/documents', '/admin/contacts']) {
    assert.equal(canOpenAdminPage('staff', path), true, path);
  }
  for (const path of ['/admin/dashboard', '/admin/roster', '/admin/team/1', '/admin/l12', '/admin/l12/match/6', '/admin/finance']) {
    assert.equal(canOpenAdminPage('staff', path), false, path);
  }
});
