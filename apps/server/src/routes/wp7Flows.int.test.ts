import '../test/pgliteEnv';
import { bearer } from '../test/fakeClerk';
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { db } from '../db';
import { eq } from 'drizzle-orm';
import { attendance, auditLogs, clubs, events, gameStatEvents, gameStats, playerGuardians, players, teams, users } from '../db/schema';
import { closeDb, createSchema } from '../test/pgliteDb';
import { serve } from '../test/serve';
import { seasonBounds } from '../lib/seasonStats';
import eventRoutes from './eventRoutes';
import gamesRouter from './games';

/**
 * WP7 leftovers from the 2026-10-15 audit, through the real routes. Event
 * dates are relative to now so the fixtures never drift into the past/future.
 */

let server: Awaited<ReturnType<typeof serve>>;
const call = (email: string, method: string, path: string, body?: unknown) =>
    server.call(method, `/api${path}`, { auth: bearer(`test_${email}`, email), body });

const DAY = 24 * 60 * 60 * 1000;
const at = (offsetMs: number) => new Date(Date.now() + offsetMs).toISOString();

const ADMIN = 'admin@club.ro';
const COACH = 'coach@club.ro';
const PARENT = 'parinte@club.ro';
let u12 = 0;
let luca = 0;
let past = 0;
let nextWeek = 0;
let finishedMatch = 0;
let clubId = 0;
let u14 = 0;

before(async () => {
    await createSchema();
    const [club] = await db.insert(clubs).values({ name: 'Club Test', normalizedName: 'club test' }).returning();
    clubId = club.id;
    await db.insert(users).values({ email: ADMIN, name: 'Admin', role: 'admin', status: 'active', clubId: club.id });
    const [coach] = await db.insert(users).values({ email: COACH, name: 'Coach', role: 'coach', status: 'active', clubId: club.id }).returning();
    [{ id: u12 }] = await db.insert(teams).values({
        frbTeamId: '', name: 'U12', frbLeagueId: '', leagueName: 'Liga', frbSeasonId: '', seasonName: '2026', inviteCode: 'U12AAA', clubId: club.id, coachId: coach.id,
    }).returning();
    [{ id: luca }] = await db.insert(players).values({ firstName: 'Luca', lastName: 'Popescu', name: 'Luca Popescu', teamId: u12 }).returning();
    [{ id: past }] = await db.insert(events).values({
        type: 'training', title: 'Antrenament trecut', startTime: at(-3 * DAY), endTime: at(-3 * DAY + 90 * 60 * 1000), teamId: u12,
    }).returning();
    [{ id: nextWeek }] = await db.insert(events).values({
        type: 'match', title: 'Meci săptămâna viitoare', startTime: at(7 * DAY), endTime: at(7 * DAY + 2 * 60 * 60 * 1000), teamId: u12,
    }).returning();

    [{ id: finishedMatch }] = await db.insert(events).values({
        type: 'match', title: 'Meci încheiat', startTime: at(-2 * DAY), endTime: at(-2 * DAY + 2 * 60 * 60 * 1000), teamId: u12,
    }).returning();
    const starters = [luca];
    const [game] = await db.insert(gameStats).values({
        eventId: finishedMatch, teamId: u12, clubId: club.id, mode: 'simple', status: 'finished',
        roster: [{ playerId: luca, number: '7', firstName: 'Luca', lastName: 'Popescu' }], starters,
        // A stale snapshot: the stored actions add up to 2–3, not 10–0.
        scoreUs: 10, scoreThem: 0, finishedAt: at(-2 * DAY),
    }).returning();
    await db.insert(gameStatEvents).values([
        { gameId: game.id, clientId: 'a', seq: 1, period: 1, side: 'us', playerId: luca, type: 'p2' },
        { gameId: game.id, clientId: 'b', seq: 2, period: 1, side: 'them', oppNumber: null, type: 'p3' },
    ]);

    // A finished match last season: never in this season's numbers.
    const [{ id: oldMatch }] = await db.insert(events).values({
        type: 'match', title: 'Meci sezonul trecut', startTime: at(-400 * DAY), endTime: at(-400 * DAY + 2 * 60 * 60 * 1000), teamId: u12,
    }).returning();
    const [oldGame] = await db.insert(gameStats).values({
        eventId: oldMatch, teamId: u12, clubId: club.id, mode: 'simple', status: 'finished',
        roster: [{ playerId: luca, number: '7', firstName: 'Luca', lastName: 'Popescu' }], starters, scoreUs: 30, scoreThem: 0,
    }).returning();
    await db.insert(gameStatEvents).values({ gameId: oldGame.id, clientId: 'old', seq: 1, period: 1, side: 'us', playerId: luca, type: 'p3' });

    // A parent whose only child plays for another team.
    [{ id: u14 }] = await db.insert(teams).values({
        frbTeamId: '', name: 'U14', frbLeagueId: '', leagueName: 'Liga', frbSeasonId: '', seasonName: '2026', inviteCode: 'U14BBB', clubId: club.id, coachId: null,
    }).returning();
    const [ana] = await db.insert(players).values({ firstName: 'Ana', lastName: 'Ionescu', name: 'Ana Ionescu', teamId: u14 }).returning();
    const [parent] = await db.insert(users).values({ email: PARENT, name: 'Ioana Ionescu', role: 'parent', status: 'active', clubId: club.id }).returning();
    await db.insert(playerGuardians).values({ playerId: ana.id, userId: parent.id });

    server = await serve({ '/api/events': eventRoutes, '/api/games': gamesRouter });
});

after(async () => {
    await server?.close();
    await closeDb();
});

test('B2: attendance for a session that has not reached its day is refused', async () => {
    for (const email of [ADMIN, COACH]) {
        const res = await call(email, 'POST', `/events/${nextWeek}/attendance`, { playerAttendances: [{ playerId: luca, status: 'present' }] });
        assert.equal(res.status, 409, `${email}: ${JSON.stringify(res.body)}`);
        assert.match(String((res.body as { error?: string }).error), /din ziua evenimentului/);
    }
    const rows = await db.select().from(attendance);
    assert.equal(rows.length, 0);
});

test('B1/B2: a past session takes every mark, late included', async () => {
    const res = await call(COACH, 'POST', `/events/${past}/attendance`, { playerAttendances: [{ playerId: luca, status: 'late' }] });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    const [row] = await db.select().from(attendance);
    assert.equal(row.status, 'late');
});

test('E3: /games/assigned for an account with no profile is an empty list, not a 500', async () => {
    const res = await call('nobody@nowhere.ro', 'GET', '/games/assigned');
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.deepEqual(res.body, []);
});

test('C2: only a club admin reopens a finished match; the score is re-derived and both steps are audited', async () => {
    const coach = await call(COACH, 'POST', `/games/events/${finishedMatch}/reopen`);
    assert.equal(coach.status, 403);

    const reopened = await call(ADMIN, 'POST', `/games/events/${finishedMatch}/reopen`);
    assert.equal(reopened.status, 200, JSON.stringify(reopened.body));
    assert.equal(reopened.body.status, 'live');
    assert.equal(reopened.body.finishedAt, null);
    assert.deepEqual([reopened.body.scoreUs, reopened.body.scoreThem], [2, 3]);

    const again = await call(ADMIN, 'POST', `/games/events/${finishedMatch}/reopen`);
    assert.equal(again.status, 409, 'a live match is not reopened twice');

    const finished = await call(COACH, 'POST', `/games/events/${finishedMatch}/finish`);
    assert.equal(finished.status, 200, JSON.stringify(finished.body));
    assert.equal(finished.body.status, 'finished');

    const log = await db.select().from(auditLogs).where(eq(auditLogs.entityId, String(finishedMatch)));
    assert.deepEqual(log.map((row) => row.action).sort(), ['game.finished', 'game.reopened']);
    assert.ok(log.every((row) => row.clubId === clubId));
});

test('C4: season statistics come from this season\'s finished matches only', async () => {
    const res = await call(COACH, 'GET', `/games/season/players/${luca}`);
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.games, 1, 'last season\'s match is left out');
    assert.equal(res.body.totals.pts, 2);
    assert.equal(res.body.averages.pts, 2);
    assert.equal(res.body.recent.length, 1);
    assert.equal(res.body.recent[0].eventId, finishedMatch);

    const team = await call(ADMIN, 'GET', `/games/season/teams/${u12}`);
    assert.equal(team.status, 200, JSON.stringify(team.body));
    assert.equal(team.body.games, 1);
    assert.deepEqual(team.body.players.map((p: { playerId: number; totals: { pts: number } }) => [p.playerId, p.totals.pts]), [[luca, 2]]);

    const lastSeason = await call(ADMIN, 'GET', `/games/season/players/${luca}?season=${seasonBounds(new Date(Date.now() - 400 * DAY)).startYear}`);
    assert.equal(lastSeason.status, 200);
    assert.equal(lastSeason.body.totals.pts, 3);
});

test('C4: a parent sees season statistics only for their own child\'s teams', async () => {
    assert.equal((await call(PARENT, 'GET', `/games/season/players/${luca}`)).status, 404);
    assert.equal((await call(PARENT, 'GET', `/games/season/teams/${u12}`)).status, 404);
    const own = await call(PARENT, 'GET', `/games/season/teams/${u14}`);
    assert.equal(own.status, 200, JSON.stringify(own.body));
    assert.equal(own.body.games, 0);
});
