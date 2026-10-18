import { test } from 'node:test';
import { strict as assert } from 'node:assert';

import { exportGaps, resolveMatchSides, withTeamCoach } from './l12Export';
import type { L12Lineup, L12Player } from '../services/l12Api';

const player = (playerId: number, shirtNumber: string): L12Player => ({ playerId, shirtNumber, license: '', u22: false, citizenship: 'ROU', naturalized: false });
const sheet = (extra: Partial<L12Lineup> = {}): L12Lineup => ({
  competition: null, gender: 'M', players: [player(1, '4'), player(2, '7')], staff: { headCoach: { name: 'Andrei Pop', license: '' } }, captainPlayerId: 1, ...extra,
});

test('the opponent comes from the match, never from the event title', () => {
  assert.deepEqual(resolveMatchSides('Turneu de toamnă', 'U12 Masculin', 'CSM Oradea'), { homeTeam: 'U12 Masculin', awayTeam: 'CSM Oradea' });
  assert.deepEqual(resolveMatchSides('Turneu de toamnă', 'U12 Masculin', null), { homeTeam: 'U12 Masculin', awayTeam: '' });
  // FRB fixtures carry both sides in the title.
  assert.deepEqual(resolveMatchSides('Amical: Rapid vs. U12 Masculin', 'U12 Masculin', 'X'), { homeTeam: 'Rapid', awayTeam: 'U12 Masculin' });
});

test('a complete sheet has no gaps; each gap is named', () => {
  assert.deepEqual(exportGaps(sheet(), { awayTeam: 'CSM' }), []);
  assert.deepEqual(exportGaps(sheet({
    players: [player(1, ''), player(2, ''), player(3, '9')],
    captainPlayerId: null,
    staff: {},
  }), { awayTeam: '' }), [
    '2 jucători fără număr de echipament',
    'niciun căpitan ales',
    'fără antrenor principal',
    'adversarul nu e completat',
  ]);
  assert.deepEqual(exportGaps(sheet({ players: [player(1, '')] }), { awayTeam: 'CSM' }), ['1 jucător fără număr de echipament']);
});

test("the team's coach fills an empty head-coach line, and only that", () => {
  assert.equal(withTeamCoach(sheet({ staff: {} }), 'Ion Ionescu').staff.headCoach?.name, 'Ion Ionescu');
  assert.equal(withTeamCoach(sheet(), 'Ion Ionescu').staff.headCoach?.name, 'Andrei Pop');
  const blank = sheet({ staff: { headCoach: { name: ' ', license: 'L-1' } } });
  assert.deepEqual(withTeamCoach(blank, 'Ion Ionescu').staff.headCoach, { name: 'Ion Ionescu', license: 'L-1' });
  assert.equal(withTeamCoach(sheet({ staff: {} }), null).staff.headCoach, undefined);
});
