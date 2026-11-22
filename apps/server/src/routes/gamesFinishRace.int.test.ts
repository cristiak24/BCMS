import '../test/pgliteEnv';
import { bearer } from '../test/fakeClerk';
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { eq } from 'drizzle-orm';
import { db } from '../db';
import { clubs, events, gameStatEvents, gameStats, players, teams, users } from '../db/schema';
import { closeDb, createSchema } from '../test/pgliteDb';
import { serve } from '../test/serve';
import gamesRouter, { saveGameEvents } from './games';

/**
 * Val 2 review: a push that read the match as live before another device
 * finished it wrote status 'live' back over 'finished' (and stored its
 * actions after the final score). The write now re-checks under the row lock.
 */

let api: Awaited<ReturnType<typeof serve>>;
const admin = bearer('user_race_admin', 'race.admin@club.ro');
let eventId = 0;
const ids: number[] = [];

before(async () => {
    await createSchema();
    const [club] = await db.insert(clubs).values({ name: 'Club Cursa', normalizedName: 'club cursa' }).returning();
    await db.insert(users).values({ email: 'race.admin@club.ro', name: 'Admin', role: 'admin', status: 'active', clubId: club.id, clerkUserId: 'user_race_admin' });
    const [team] = await db.insert(teams).values({
        frbTeamId: '', name: 'U16', frbLeagueId: '', leagueName: 'Liga', frbSeasonId: '', seasonName: '2026', inviteCode: 'CURSA16', clubId: club.id,
    }).returning();
    for (const key of ['a', 'b', 'c', 'd', 'e']) {
        const [p] = await db.insert(players).values({ clubId: club.id, teamId: team.id, firstName: key, lastName: 'Test' } as typeof players.$inferInsert).returning();
        ids.push(p.id);
    }
    const start = new Date(Date.now() - 3_600_000).toISOString();
    [{ id: eventId }] = await db.insert(events).values({ type: 'match', title: 'U16 vs Rival', startTime: start, endTime: start, teamId: team.id }).returning();
    api = await serve({ '/api/games': gamesRouter });
});

after(async () => {
    await api.close();
    await closeDb();
});

const action = (clientId: string, seq: number) => ({ clientId, seq, period: 1, clockSec: null, side: 'us', playerId: ids[0], type: 'p2' });

test('a push landing after another device finished the match never reopens it', async () => {
    const setup = await api.call('PUT', `/api/games/events/${eventId}/setup`, {
        auth: admin, body: { mode: 'simple', roster: ids, starters: ids },
    });
    assert.equal(setup.status, 200, JSON.stringify(setup.body));
    const pushed = await api.call('POST', `/api/games/events/${eventId}/events`, { auth: admin, body: { events: [action('racebasket01', 1)] } });
    assert.equal(pushed.status, 200, JSON.stringify(pushed.body));
    assert.equal(pushed.body.scoreUs, 2);

    const finished = await api.call('POST', `/api/games/events/${eventId}/finish`, { auth: admin });
    assert.equal(finished.status, 200, JSON.stringify(finished.body));
    const [game] = await db.select().from(gameStats).where(eq(gameStats.eventId, eventId));
    assert.equal(game.status, 'finished');

    // The late push already passed its own status check (it read 'live'): the
    // write itself must refuse.
    const late = await saveGameEvents(game.id, [{ ...action('racebasket02', 2), side: 'us', playerId: ids[1], otherPlayerId: null, oppNumber: null, type: 'p3', deleted: false, clockSec: null }], { period: 1 }, 1);
    assert.equal(late, null);
    const [after] = await db.select().from(gameStats).where(eq(gameStats.id, game.id));
    assert.equal(after.status, 'finished');
    assert.equal(after.scoreUs, 2);
    const stored = await db.select().from(gameStatEvents).where(eq(gameStatEvents.gameId, game.id));
    assert.deepEqual(stored.map((e) => e.clientId), ['racebasket01']);

    const refused = await api.call('POST', `/api/games/events/${eventId}/events`, { auth: admin, body: { events: [action('racebasket03', 3)] } });
    assert.equal(refused.status, 409);
});
