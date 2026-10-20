import '../test/pgliteEnv';
import { bearer } from '../test/fakeClerk';
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { eq } from 'drizzle-orm';
import { db } from '../db';
import { clubs, events, gameStatEvents, gameStats, l12Lineups, teams, users } from '../db/schema';
import { closeDb, createSchema } from '../test/pgliteDb';
import { serve } from '../test/serve';
import l12Router from './l12';
import gamesRouter from './games';

/**
 * R3-2 / R3-3 from the 2026-10-15 audit: the U12 coach overwrote the U14 L12
 * template and match sheet, and any coach could set up and keep the stats of
 * any match in the club. A coach now changes only what they manage
 * (lib/coachScope.ts), as for events and attendance.
 */

let api: Awaited<ReturnType<typeof serve>>;
let u12 = 0;
let u14 = 0;
let u12Match = 0;
let u14Match = 0;
let u14MatchAssigned = 0;
const coach12 = bearer('user_coach12', 'coach12@club.ro');
const admin = bearer('user_admin', 'admin@club.ro');

async function team(name: string, code: string, clubId: number, coachId: number | null) {
    const [row] = await db.insert(teams).values({
        frbTeamId: '', name, frbLeagueId: '', leagueName: 'Liga', frbSeasonId: '', seasonName: '2026', inviteCode: code, clubId, coachId,
    }).returning();
    return row.id;
}

async function match(teamId: number, clubId: number, coachId: number | null = null) {
    const [row] = await db.insert(events).values({
        type: 'match', title: 'Meci', startTime: '2026-10-25 10:00:00', endTime: '2026-10-25 12:00:00', teamId, clubId, coachId,
    } as typeof events.$inferInsert).returning();
    return row.id;
}

before(async () => {
    await createSchema();
    const [club] = await db.insert(clubs).values({ name: 'Club', normalizedName: 'club' }).returning();
    await db.insert(users).values({ email: 'admin@club.ro', name: 'Admin', role: 'admin', status: 'active', clubId: club.id, clerkUserId: 'user_admin' });
    const [c12] = await db.insert(users).values({ email: 'coach12@club.ro', name: 'Antrenor U12', role: 'coach', status: 'active', clubId: club.id, clerkUserId: 'user_coach12' }).returning();
    const [c14] = await db.insert(users).values({ email: 'coach14@club.ro', name: 'Antrenor U14', role: 'coach', status: 'active', clubId: club.id, clerkUserId: 'user_coach14' }).returning();
    u12 = await team('U12', 'AAA111', club.id, c12.id);
    u14 = await team('U14', 'BBB222', club.id, c14.id);
    u12Match = await match(u12, club.id);
    u14Match = await match(u14, club.id);
    // The U12 coach was asked to take this one U14 match.
    u14MatchAssigned = await match(u14, club.id, c12.id);
    api = await serve({ '/api/l12': l12Router, '/api/games': gamesRouter });
});

after(async () => {
    await api.close();
    await closeDb();
});

const sheet = { competition: 'Liga', players: [], staff: {} };

test('L12: a coach cannot read or overwrite another team\'s template or match sheet', async () => {
    assert.equal((await api.call('PUT', `/api/l12/teams/${u14}/template`, { auth: coach12, body: sheet })).status, 403);
    assert.equal((await api.call('GET', `/api/l12/teams/${u14}/template`, { auth: coach12 })).status, 403);
    assert.equal((await api.call('PUT', `/api/l12/events/${u14Match}`, { auth: coach12, body: sheet })).status, 403);
    assert.equal((await api.call('DELETE', `/api/l12/events/${u14Match}`, { auth: coach12 })).status, 403);
    assert.equal((await db.select().from(l12Lineups).where(eq(l12Lineups.teamId, u14))).length, 0);
});

test('L12: the coach still manages their own team and an assigned match; the admin every team', async () => {
    assert.equal((await api.call('PUT', `/api/l12/teams/${u12}/template`, { auth: coach12, body: sheet })).status, 200);
    assert.equal((await api.call('PUT', `/api/l12/events/${u12Match}`, { auth: coach12, body: sheet })).status, 200);
    assert.equal((await api.call('PUT', `/api/l12/events/${u14MatchAssigned}`, { auth: coach12, body: sheet })).status, 200);
    assert.equal((await api.call('PUT', `/api/l12/teams/${u14}/template`, { auth: admin, body: sheet })).status, 200);
    // Reading too: a sheet lists the players' personal data (P1-5).
    assert.equal((await api.call('GET', `/api/l12/events/${u14Match}`, { auth: coach12 })).status, 403);
    assert.equal((await api.call('GET', `/api/l12/events/${u14MatchAssigned}`, { auth: coach12 })).status, 200);
    const overview = await api.call('GET', '/api/l12/overview', { auth: coach12 });
    assert.deepEqual(overview.body.teams.map((t: { id: number }) => t.id), [u12]);
    assert.deepEqual(overview.body.matches.map((m: { eventId: number }) => m.eventId).sort(), [u12Match, u14MatchAssigned].sort());
});

test('scorer: a coach cannot set up or keep another team\'s match', async () => {
    // The admin already set the U14 match up.
    const [game] = await db.insert(gameStats).values({ eventId: u14Match, teamId: u14, clubId: (await db.select().from(teams).where(eq(teams.id, u14)))[0].clubId!, mode: 'simple', status: 'live' }).returning();

    const read = await api.call('GET', `/api/games/events/${u14Match}`, { auth: coach12 });
    assert.equal(read.status, 200);
    assert.equal(read.body.canKeep, false);
    assert.equal(read.body.canSetup, false);

    assert.equal((await api.call('PUT', `/api/games/events/${u14Match}/setup`, { auth: coach12, body: { roster: [], starters: [] } })).status, 403);
    const keep = await api.call('POST', `/api/games/events/${u14Match}/events`, {
        auth: coach12,
        body: { events: [{ clientId: 'c1', period: 1, side: 'them', type: 'pts2' }] },
    });
    assert.equal(keep.status, 403);
    assert.equal((await db.select().from(gameStatEvents).where(eq(gameStatEvents.gameId, game.id))).length, 0);
    assert.equal((await api.call('POST', `/api/games/events/${u14Match}/finish`, { auth: coach12 })).status, 403);
    assert.equal((await api.call('GET', `/api/games/events/${u14Match}/keepers`, { auth: coach12 })).status, 403);
});

test('scorer: own team, an assigned match and the admin pass the access check', async () => {
    for (const [eventId, auth] of [[u12Match, coach12], [u14MatchAssigned, coach12]] as const) {
        const read = await api.call('GET', `/api/games/events/${eventId}`, { auth });
        assert.equal(read.body.canSetup, true, `event ${eventId}`);
        // Past the access check, the empty roster is what gets refused.
        const setup = await api.call('PUT', `/api/games/events/${eventId}/setup`, { auth, body: { roster: [], starters: [] } });
        assert.equal(setup.status, 400);
    }
    const adminRead = await api.call('GET', `/api/games/events/${u14Match}`, { auth: admin });
    assert.equal(adminRead.body.canKeep, true);
    assert.equal(adminRead.body.canSetup, true);
});
