import { test } from 'node:test';
import { strict as assert } from 'node:assert';

import { autoApprovableIds, defaultTarget, denyMessage, formatBirth, matchWarnings } from './joinRequestReview';
import type { FamilyJoinRequest, JoinSuggestion } from '../services/familyRequestsApi';

const radu: JoinSuggestion = {
  id: 9, firstName: 'Radu', lastName: 'Stan', birthYear: 2014, birthDate: null, number: 7,
  hasAccount: false, guardians: 1, teams: ['U12'], exact: true, sameBirthYear: true, birthMismatch: false,
};

const request = (extra: Partial<FamilyJoinRequest> = {}): FamilyJoinRequest => ({
  id: 1,
  kind: 'parent',
  status: 'pending',
  team: { id: 2, name: 'U12' },
  requester: { id: 5, name: 'Mihai Ionescu', email: 'm@x.ro', phone: null, status: 'active' },
  child: { firstName: 'Radu', lastName: 'Stan', birthDate: '2014-05-02' },
  playerId: null,
  createdAt: '2026-10-16T10:00:00Z',
  suggestions: [radu],
  ...extra,
});

test('a same-name child is never preselected', () => {
  assert.equal(defaultTarget(request()), 'new');
  assert.equal(defaultTarget(request({ suggestions: [{ ...radu, guardians: 0 }] })), 'new');
});

test('"Aprobă toți" leaves out every request with a match in the club', () => {
  const list = [request({ id: 1 }), request({ id: 2, suggestions: [] }), request({ id: 3, suggestions: [{ ...radu, exact: false }] })];
  assert.deepEqual(autoApprovableIds(list), [2]);
});

test('warnings: a parent already linked, a different birth date, an existing account', () => {
  assert.deepEqual(matchWarnings(request(), radu), ['Radu Stan are deja un părinte legat.']);
  assert.deepEqual(matchWarnings(request(), { ...radu, guardians: 2, birthMismatch: true, birthYear: 2013 }), [
    'Radu Stan are deja 2 părinți legați.',
    'Data nașterii diferă: în cerere 02.05.2014, în club 2013.',
  ]);
  assert.deepEqual(matchWarnings(request({ kind: 'player' }), { ...radu, guardians: 0, hasAccount: true }), ['Radu Stan are deja un cont de jucător.']);
  assert.deepEqual(matchWarnings(request(), { ...radu, guardians: 0 }), []);
});

test('deny copy: only a waiting account stays "în așteptare"', () => {
  assert.equal(denyMessage(request({ requester: { ...request().requester, status: 'pending' } })), 'Contul rămâne în așteptare, fără acces la echipă.');
  assert.match(denyMessage(request()), /nu va fi legat de Radu Stan\. Contul rămâne activ/);
  assert.match(denyMessage(request({ kind: 'player' })), /nu intră în U12\. Contul rămâne activ/);
});

test('birth dates read in Romanian order; a year alone stays a year', () => {
  assert.equal(formatBirth('2014-05-02'), '02.05.2014');
  assert.equal(formatBirth('2014'), '2014');
  assert.equal(formatBirth(null), '');
});
