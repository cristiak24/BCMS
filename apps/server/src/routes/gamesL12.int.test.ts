import '../test/pgliteEnv';
import { bearer } from '../test/fakeClerk';
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { db } from '../db';
import { clubs, events, l12Lineups, players, teams, users } from '../db/schema';
import { closeDb, createSchema } from '../test/pgliteDb';
import { serve } from '../test/serve';
import gamesRouter from './games';

/**
 * Critique 6: the scorer offered the whole team although the match had an
 * official L12, and let a player with an expired visa start.
 */

let api: Awaited<ReturnType<typeof serve>>;
const admin = bearer('user_games_admin', 'games.admin@club.ro');
let withL12 = 0;
let withoutL12 = 0;
const ids: Record<string, number> = {};

before(async () => {
    await createSchema();
    const [club] = await db.insert(clubs).values({ name: 'Club Scor', normalizedName: 'club scor' }).returning();
    await db.insert(users).values({ email: 'games.admin@club.ro', name: 'Admin', role: 'admin', status: 'active', clubId: club.id, clerkUserId: 'user_games_admin' });
    const [team] = await db.insert(teams).values({
        frbTeamId: '', name: 'U14', frbLeagueId: '', leagueName: 'Liga', frbSeasonId: '', seasonName: '2026', inviteCode: 'SCOR14', clubId: club.id,
    }).returning();
    const inAYear = new Date(Date.now() + 365 * 86_400_000).toISOString();
    const lastMonth = new Date(Date.now() - 30 * 86_400_000).toISOString();
    for (const [key, expiry] of [['a', inAYear], ['b', inAYear], ['c', inAYear], ['d', inAYear], ['e', inAYear], ['expired', lastMonth], ['offList', inAYear]] as const) {
        const [p] = await db.insert(players).values({ clubId: club.id, teamId: team.id, firstName: key, lastName: 'Test', medicalCheckExpiry: expiry } as typeof players.$inferInsert).returning();
        ids[key] = p.id;
    }
    const start = new Date(Date.now() - 3_600_000).toISOString();
    [{ id: withL12 }] = await db.insert(events).values({ type: 'match', title: 'U14 vs Rival', startTime: start, endTime: start, teamId: team.id }).returning();
    [{ id: withoutL12 }] = await db.insert(events).values({ type: 'match', title: 'U14 vs Alt rival', startTime: start, endTime: start, teamId: team.id }).returning();
    const onList = ['a', 'b', 'c', 'd', 'e', 'expired'].map((key) => ({ playerId: ids[key], shirtNumber: '' }));
    await db.insert(l12Lineups).values({ teamId: team.id, eventId: withL12, players: onList });
    api = await serve({ '/api/games': gamesRouter });
});

after(async () => {
    await api.close();
    await closeDb();
});

test('with an L12 saved, the scorer offers only its players; without one, the whole team', async () => {
    const listed = await api.call('GET', `/api/games/events/${withL12}`, { auth: admin });
    assert.equal(listed.status, 200, JSON.stringify(listed.body));
    const lineupIds = listed.body.lineup.map((p: { playerId: number }) => p.playerId);
    assert.ok(!lineupIds.includes(ids.offList), 'a player not on the L12 is not offered');
    assert.equal(lineupIds.length, 6);
    assert.equal(listed.body.lineup.find((p: { playerId: number }) => p.playerId === ids.expired).visaExpired, true);

    const whole = await api.call('GET', `/api/games/events/${withoutL12}`, { auth: admin });
    assert.equal(whole.body.lineup.length, 7);
});

test('an expired visa cannot play the match, not even from the bench', async () => {
    const withExpired = ['a', 'b', 'c', 'd', 'e', 'expired'].map((key) => ids[key]);
    const refused = await api.call('PUT', `/api/games/events/${withL12}/setup`, {
        auth: admin, body: { mode: 'simple', roster: withExpired, starters: [ids.a, ids.b, ids.c, ids.d, ids.e] },
    });
    assert.equal(refused.status, 400);
    assert.match(refused.body.error, /viza expirată/);

    const ok = await api.call('PUT', `/api/games/events/${withL12}/setup`, {
        auth: admin, body: { mode: 'simple', roster: withExpired.filter((id) => id !== ids.expired), starters: [ids.a, ids.b, ids.c, ids.d, ids.e] },
    });
    assert.equal(ok.status, 200, JSON.stringify(ok.body));
});
