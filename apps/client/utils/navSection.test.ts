import test from 'node:test';
import assert from 'node:assert/strict';
import { navSectionPath } from './navSection';

test('detail pages light up their menu section', () => {
  assert.equal(navSectionPath('/admin/team/1'), '/admin/my-club-admin');
  assert.equal(navSectionPath('/admin/player/2'), '/admin/roster');
  assert.equal(navSectionPath('/admin/event/7'), '/admin/schedule');
  assert.equal(navSectionPath('/admin/attendance/7'), '/admin/schedule');
  assert.equal(navSectionPath('/admin/stats/7'), '/admin/schedule');
});

test('menu pages are their own section', () => {
  assert.equal(navSectionPath('/admin/roster'), '/admin/roster');
  assert.equal(navSectionPath('/admin/l12/match/6'), '/admin/l12/match/6');
});
