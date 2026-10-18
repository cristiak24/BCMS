import test from 'node:test';
import assert from 'node:assert/strict';
import { titleForPath } from './routeTitles';

test('each section names itself in the tab title', () => {
  assert.equal(titleForPath('/admin/roster'), 'Lot · BCMS');
  assert.equal(titleForPath('/admin/finance'), 'Finanțe · BCMS');
  assert.equal(titleForPath('/schedule'), 'Program · BCMS');
  assert.equal(titleForPath('/coach/teams'), 'Echipe · BCMS');
});

test('detail routes match their pattern, trailing slashes included', () => {
  assert.equal(titleForPath('/admin/team/12'), 'Echipă · BCMS');
  assert.equal(titleForPath('/admin/users/3'), 'Utilizator · BCMS');
  assert.equal(titleForPath('/admin/users/'), 'Utilizatori · BCMS');
  assert.equal(titleForPath('/coach/l12/match/4'), 'L12 · Meci · BCMS');
});

test('the landing page and unknown paths still say BCMS', () => {
  assert.equal(titleForPath('/'), 'BCMS · Basketball Club Management System');
  assert.equal(titleForPath('/admin/nope/1/2'), 'Pagină negăsită · BCMS');
});
