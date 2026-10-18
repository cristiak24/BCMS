import { test } from 'node:test';
import { strict as assert } from 'node:assert';

import { internalMatchResult, matchSheetPath, opponentOf, showMatchSheetLink, type EventGameSummary } from './matchResult';

const finished = (scoreUs: number, scoreThem: number, opponentName: string | null = 'CSM Oradea'): EventGameSummary => ({
  status: 'finished', scoreUs, scoreThem, opponentName, finishedAt: '2026-10-16T18:00:00.000Z',
});

const match = (extra: Record<string, unknown> = {}) => ({
  id: 3, type: 'match', title: 'Turneu de toamnă', status: 'scheduled', teamName: 'U12 Masculin', ...extra,
});

test('a finished internal match is a result, our score first', () => {
  const result = internalMatchResult(match({ game: finished(9, 5) }));
  assert.deepEqual(result, { us: 9, them: 5, ourName: 'U12 Masculin', theirName: 'CSM Oradea', outcome: 'win', label: '9 - 5' });
  assert.equal(internalMatchResult(match({ game: finished(40, 52) }))?.outcome, 'loss');
  assert.equal(internalMatchResult(match({ game: finished(30, 30) }))?.outcome, 'draw');
});

test('live, setup, missing or cancelled games are not results', () => {
  assert.equal(internalMatchResult(match({ game: { ...finished(9, 5), status: 'live' } })), null);
  assert.equal(internalMatchResult(match({ game: { ...finished(0, 0), status: 'setup' } })), null);
  assert.equal(internalMatchResult(match()), null);
  assert.equal(internalMatchResult(match({ game: finished(9, 5), status: 'cancelled' })), null);
  assert.equal(internalMatchResult(match({ type: 'training', game: finished(9, 5) })), null);
});

test('the opponent comes from the scorer, then the event, then the title', () => {
  assert.equal(opponentOf(match({ game: finished(1, 0, 'Rapid'), opponent: 'Dinamo' })), 'Rapid');
  assert.equal(opponentOf(match({ game: finished(1, 0, null), opponent: 'Dinamo' })), 'Dinamo');
  assert.equal(opponentOf(match({ title: 'CSM Oradea vs U12 Masculin' })), 'CSM Oradea');
  assert.equal(opponentOf(match({ title: 'U12 Masculin vs. Steaua' })), 'Steaua');
  // Neither side of the title is us: no guess.
  assert.equal(opponentOf(match({ title: 'A vs B' })), null);
  assert.equal(internalMatchResult(match({ game: finished(2, 1, null) }))?.theirName, 'Adversar');
});

test('each role opens the match sheet in its own shell', () => {
  assert.equal(matchSheetPath('admin', 7), '/admin/stats/7');
  assert.equal(matchSheetPath('staff', 7), '/admin/stats/7');
  assert.equal(matchSheetPath('coach', 7), '/coach/stats/7');
  assert.equal(matchSheetPath('parent', 7), '/stats/7');
  assert.equal(matchSheetPath('player', 7), '/stats/7');
});

test('players and parents get the link once someone keeps statistics; staff on every match', () => {
  assert.equal(showMatchSheetLink(match(), 'coach'), true);
  assert.equal(showMatchSheetLink(match(), 'admin'), true);
  assert.equal(showMatchSheetLink(match(), 'parent'), false);
  assert.equal(showMatchSheetLink(match({ game: { ...finished(0, 0), status: 'setup' } }), 'player'), false);
  assert.equal(showMatchSheetLink(match({ game: { ...finished(4, 2), status: 'live' } }), 'player'), true);
  assert.equal(showMatchSheetLink(match({ game: finished(4, 2) }), 'parent'), true);
  // Trainings, FRB rows (negative ids on Acasă) and cancelled matches: none.
  assert.equal(showMatchSheetLink(match({ type: 'training' }), 'coach'), false);
  assert.equal(showMatchSheetLink(match({ id: -12 }), 'coach'), false);
  assert.equal(showMatchSheetLink(match({ status: 'cancelled', game: finished(1, 0) }), 'parent'), false);
});
