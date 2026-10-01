import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseL12Input, L12_MAX_PLAYERS } from './l12';

const player = (playerId: number, shirtNumber = String(playerId)) => ({ playerId, shirtNumber, license: 'L-1', u22: false, citizenship: 'ROU', naturalized: false });

test('accepts a full sheet and keeps only known staff roles', () => {
    const result = parseL12Input({
        competition: '  Campionatul Național  U16 ',
        gender: 'M',
        players: [player(1), player(2)],
        captainPlayerId: 2,
        staff: { headCoach: { name: 'Andrei Popescu', license: 'A-12' }, janitor: { name: 'x' }, doctor: { name: '' } },
    });
    assert.ok(result.ok);
    if (!result.ok) return;
    assert.equal(result.data.competition, 'Campionatul Național U16');
    assert.equal(result.data.captainPlayerId, 2);
    assert.deepEqual(Object.keys(result.data.staff), ['headCoach']);
});

test('rejects more than twelve players', () => {
    const players = Array.from({ length: L12_MAX_PLAYERS + 1 }, (_, i) => player(i + 1));
    assert.equal(parseL12Input({ players }).ok, false);
});

test('rejects duplicate players and duplicate shirt numbers', () => {
    assert.equal(parseL12Input({ players: [player(1), player(1, '9')] }).ok, false);
    assert.equal(parseL12Input({ players: [player(1, '7'), player(2, '7')] }).ok, false);
});

test('rejects a captain who is not on the sheet', () => {
    assert.equal(parseL12Input({ players: [player(1)], captainPlayerId: 5 }).ok, false);
});

test('rejects a non-numeric shirt number but allows a blank one', () => {
    assert.equal(parseL12Input({ players: [player(1, 'A1')] }).ok, false);
    assert.equal(parseL12Input({ players: [player(1, '')] }).ok, true);
});

test('normalises unknown gender to null', () => {
    const result = parseL12Input({ players: [], gender: 'X' });
    assert.ok(result.ok && result.data.gender === null);
});
