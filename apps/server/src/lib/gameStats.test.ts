import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeBoxScore, parseEvent, parseOpponentRoster, type GameEvent } from './gameStats';

let seq = 0;
const ev = (partial: Partial<GameEvent>): GameEvent => ({
    clientId: `c${seq}xxxxxxx`, seq: seq++, period: 1, clockSec: null, side: 'us', playerId: null,
    otherPlayerId: null, oppNumber: null, type: 'p2', deleted: false, ...partial,
});

const ctx = { mode: 'simple' as const, playerIds: new Set([1, 2, 3]), oppNumbers: new Set(['10']) };

test('simple mode rejects full-only actions; unknown players rejected', () => {
    assert.equal(parseEvent({ clientId: 'abcdefgh', seq: 1, period: 1, type: 'reb_d', side: 'us', playerId: 1 }, ctx).ok, false);
    assert.equal(parseEvent({ clientId: 'abcdefgh', seq: 1, period: 1, type: 'p2', side: 'us', playerId: 9 }, ctx).ok, false);
    assert.equal(parseEvent({ clientId: 'abcdefgh', seq: 1, period: 1, type: 'p2', side: 'us', playerId: 1 }, ctx).ok, true);
});

test('opponent: team-level or a known number', () => {
    assert.equal(parseEvent({ clientId: 'abcdefgh', seq: 1, period: 1, type: 'p3', side: 'them' }, ctx).ok, true);
    assert.equal(parseEvent({ clientId: 'abcdefgh', seq: 1, period: 1, type: 'p3', side: 'them', oppNumber: '10' }, ctx).ok, true);
    assert.equal(parseEvent({ clientId: 'abcdefgh', seq: 1, period: 1, type: 'p3', side: 'them', oppNumber: '99' }, ctx).ok, false);
    assert.equal(parseEvent({ clientId: 'abcdefgh', seq: 1, period: 1, type: 'sub', side: 'them' }, ctx).ok, false);
});

test('opponent roster: numbers unique, names optional', () => {
    const ok = parseOpponentRoster([{ number: '4' }, { number: '12', name: ' Ion  Pop ' }]);
    assert.ok(ok.ok && ok.value[1].name === 'Ion Pop' && ok.value[0].name === '');
    assert.equal(parseOpponentRoster([{ number: '4' }, { number: '4' }]).ok, false);
    assert.equal(parseOpponentRoster([{ number: 'A' }]).ok, false);
});

test('score, team fouls and lines; deleted events (undo) do not count', () => {
    seq = 0;
    const box = computeBoxScore([
        ev({ type: 'period_start' }),
        ev({ type: 'p2', playerId: 1 }),
        ev({ type: 'p3', playerId: 1 }),
        ev({ type: 'p3', playerId: 2, deleted: true }),
        ev({ type: 'p1', side: 'them', oppNumber: '10' }),
        ev({ type: 'foul', playerId: 2 }),
        ev({ type: 'foul', side: 'them' }),
        ev({ type: 'p2', side: 'us', playerId: 3, period: 2 }),
    ], [1, 2], null);
    assert.equal(box.us, 7);
    assert.equal(box.them, 1);
    assert.equal(box.players[1].pts, 5);
    assert.equal(box.players[2].pts, 0);
    assert.equal(box.players[2].pf, 1);
    assert.deepEqual(box.teamFouls[1], { us: 1, them: 1 });
    assert.equal(box.opponents['10'].pts, 1);
    assert.deepEqual(box.byPeriod.map((r) => [r.period, r.us, r.them]), [[1, 5, 1], [2, 2, 0]]);
});

test('minutes from clock stamps across a substitution and two periods', () => {
    seq = 0;
    const box = computeBoxScore([
        ev({ type: 'period_start', clockSec: 600 }),
        ev({ type: 'sub', playerId: 3, otherPlayerId: 2, clockSec: 240 }),
        ev({ type: 'period_end', clockSec: 0 }),
        ev({ type: 'period_start', period: 2, clockSec: 600 }),
        ev({ type: 'period_end', period: 2, clockSec: 0 }),
    ], [1, 2], 600);
    assert.equal(box.players[1].secondsPlayed, 1200);
    assert.equal(box.players[2].secondsPlayed, 360);
    assert.equal(box.players[3].secondsPlayed, 840);
    assert.deepEqual(box.onCourt.sort(), [1, 3]);
});
