import { test } from 'node:test';
import { strict as assert } from 'node:assert';

import { computeBoxScore, type GameEvent } from './gameStats';

// Mirrors apps/server/src/lib/gameStats.test.ts — the two computeBoxScore copies must agree.
let seq = 0;
const ev = (partial: Partial<GameEvent>): GameEvent => ({
  clientId: `c${seq}xxxxxxx`, seq: seq++, period: 1, clockSec: null, side: 'us', playerId: null,
  otherPlayerId: null, oppNumber: null, type: 'p2', deleted: false, ...partial,
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
