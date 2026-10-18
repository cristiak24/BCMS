import '../test/pgliteEnv';
import { bearer } from '../test/fakeClerk';
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { and, eq, sql } from 'drizzle-orm';
import { db, pglite } from '../db';
import {
    attendance, clubs, events, familyJoinRequests, gameStatEvents, gameStats, notifications, playerGuardians,
    players, playersToTeams, privacyRequests, teams, users,
} from '../db/schema';
import { closeDb, createSchema } from '../test/pgliteDb';
import { serve } from '../test/serve';
import eventRoutes from './eventRoutes';
import gamesRouter from './games';
import familyRequestRoutes from './familyRequests';
import privacyRoutes from './privacy';
import playerRoutes from './playerRoutes';
import dashboardRoutes from './dashboard';
import teamsRoutes from './teams';
import l12Routes from './l12';
import profileRoutes from './profile';
import clubAdminRoutes from './clubAdmin';
import superAdminRoutes from './superAdmin';

/**
 * Missing flows from the 2026-10-15 audit (WP4B), through the real routes:
 * own-scorer results on events, join requests with a same-name child, GDPR
 * requests that can be closed, one attendance rate, the match opponent and the
 * L12 sheet, profile validation and a coach's deactivation.
 */

let server: Awaited<ReturnType<typeof serve>>;
const call = (email: string, method: string, url: string, body?: unknown, headers?: Record<string, string>) =>
    server.call(method, `/api${url}`, { auth: bearer(`test_${email}`, email), body, headers });

const ADMIN = 'admin@club.ro';
const COACH = 'coach@club.ro';
const COACH2 = 'coach2@club.ro';
const PARENT = 'parinte@club.ro';
const STRANGER = 'strain@club.ro';
const OTHER_ADMIN = 'admin@altclub.ro';
const SUPER = 'super@bcms.ro';

let clubId = 0;
let u12 = 0;
let u14 = 0;
let coachId = 0;
let coach2Id = 0;
let parentId = 0;
let strangerId = 0;
let radu = 0;
let matei = 0;
let ana = 0;
let match = 0;

const daysAgo = (n: number) => new Date(Date.now() - n * 24 * 60 * 60 * 1000).toISOString();

before(async () => {
    await createSchema();
    const [club] = await db.insert(clubs).values({ name: 'Club Test', normalizedName: 'club test' }).returning();
    const [other] = await db.insert(clubs).values({ name: 'Alt Club', normalizedName: 'alt club' }).returning();
    clubId = club.id;
    await db.insert(users).values([
        { email: ADMIN, name: 'Admin', role: 'admin', status: 'active', clubId },
        { email: OTHER_ADMIN, name: 'Alt Admin', role: 'admin', status: 'active', clubId: other.id },
        { email: SUPER, name: 'Super', role: 'superadmin', status: 'active', clubId: null },
    ]);
    [{ id: coachId }] = await db.insert(users).values({ email: COACH, name: 'Andrei Antrenor', role: 'coach', status: 'active', clubId }).returning();
    [{ id: coach2Id }] = await db.insert(users).values({ email: COACH2, name: 'Bogdan Antrenor', role: 'coach', status: 'active', clubId }).returning();
    [{ id: parentId }] = await db.insert(users).values({ email: PARENT, name: 'Ioana Popescu', firstName: 'Ioana', lastName: 'Popescu', role: 'parent', status: 'active', clubId }).returning();
    [{ id: strangerId }] = await db.insert(users).values({ email: STRANGER, name: 'Mihai Ionescu', role: 'parent', status: 'active', clubId }).returning();

    const team = (name: string, inviteCode: string, coach: number | null) => db.insert(teams).values({
        frbTeamId: '', name, frbLeagueId: '', leagueName: 'Liga', frbSeasonId: '', seasonName: '2026', inviteCode, clubId, coachId: coach,
    }).returning();
    [{ id: u12 }] = await team('U12', 'U12AAA', coachId);
    [{ id: u14 }] = await team('U14', 'U14BBB', coach2Id);

    const player = (firstName: string, lastName: string, teamId: number | null, birthYear: number | null = null) =>
        db.insert(players).values({ firstName, lastName, name: `${firstName} ${lastName}`, teamId, birthYear }).returning();
    [{ id: radu }] = await player('Radu', 'Stan', u12, 2014);
    [{ id: matei }] = await player('Matei', 'Popescu', u12, 2015);
    [{ id: ana }] = await player('Ana', 'Popescu', u14, 2012);
    await player('Liber', 'Neatribuit', null);
    await db.insert(playersToTeams).values([{ playerId: radu, teamId: u12 }, { playerId: matei, teamId: u12 }, { playerId: ana, teamId: u14 }]);
    await db.insert(playerGuardians).values([{ playerId: matei, userId: parentId }, { playerId: ana, userId: parentId }, { playerId: radu, userId: parentId }]);

    [{ id: match }] = await db.insert(events).values({
        type: 'match', title: 'Turneu de toamnă', startTime: daysAgo(1), endTime: daysAgo(1), teamId: u12,
    }).returning();

    server = await serve({
        '/api/events': eventRoutes, '/api/games': gamesRouter, '/api/family-requests': familyRequestRoutes,
        '/api/privacy': privacyRoutes, '/api/players': playerRoutes, '/api/dashboard': dashboardRoutes,
        '/api/teams': teamsRoutes, '/api/l12': l12Routes, '/api/profile': profileRoutes,
        '/api/club-admin': clubAdminRoutes, '/api/super-admin': superAdminRoutes,
    });
});

after(async () => {
    await server?.close();
    await closeDb();
});

test('migration 0027 adds the new columns, and running it twice is harmless', async () => {
    assert.ok(pglite, 'integration tests run on PGlite');
    await pglite.exec(`
        ALTER TABLE "privacy_requests" DROP CONSTRAINT IF EXISTS "privacy_requests_closed_by_users_id_fk";
        ALTER TABLE "privacy_requests" DROP COLUMN "closed_by";
        ALTER TABLE "privacy_requests" DROP COLUMN "resolution_note";
        ALTER TABLE "events" DROP COLUMN "opponent";
        ALTER TABLE "players" DROP COLUMN "birth_date";
    `);
    const file = path.resolve(__dirname, '../db/migrations/0027_wp4b_flows.sql');
    const statements = fs.readFileSync(file, 'utf8').split('--> statement-breakpoint');
    for (let run = 0; run < 2; run++) {
        for (const statement of statements) await pglite.exec(statement);
    }
    const { rows } = await pglite.query<{ table_name: string; column_name: string }>(`
        SELECT table_name, column_name FROM information_schema.columns
        WHERE (table_name, column_name) IN (('events','opponent'), ('players','birth_date'), ('privacy_requests','closed_by'), ('privacy_requests','resolution_note'))
    `);
    assert.equal(rows.length, 4);
});

// ── 1. Own-scorer results ──────────────────────────────────────────────────

test('a finished match of the club scorer reaches the parent with its score; the final score is recomputed', async () => {
    const setup = await call(ADMIN, 'PUT', `/games/events/${match}/setup`, {
        mode: 'simple', roster: [radu, matei, ana].filter((id) => id !== ana), starters: [],
    });
    // The squad has two players here: setup needs five — seed the game directly instead.
    assert.equal(setup.status, 400);
    const [game] = await db.insert(gameStats).values({
        eventId: match, teamId: u12, clubId, mode: 'simple', status: 'live', opponentName: 'CSM Oradea',
        roster: [{ playerId: radu, number: '7', firstName: 'Radu', lastName: 'Stan' }], starters: [radu],
        scoreUs: 0, scoreThem: 0,
    }).returning();
    await db.insert(gameStatEvents).values([
        { gameId: game.id, clientId: 'aaaaaaaa1', seq: 1, period: 1, side: 'us', playerId: radu, type: 'p2' },
        { gameId: game.id, clientId: 'aaaaaaaa2', seq: 2, period: 1, side: 'us', playerId: radu, type: 'p3' },
        { gameId: game.id, clientId: 'aaaaaaaa3', seq: 3, period: 1, side: 'them', type: 'p2' },
    ]);
    const finished = await call(ADMIN, 'POST', `/games/events/${match}/finish`);
    assert.equal(finished.status, 200, JSON.stringify(finished.body));
    assert.equal(finished.body.scoreUs, 5, 'the stale 0–0 snapshot is replaced by the actions');
    assert.equal(finished.body.scoreThem, 2);

    const list = await call(PARENT, 'GET', `/events?start=${encodeURIComponent(daysAgo(10))}`, undefined, { 'X-BCMS-Child': String(matei) });
    assert.equal(list.status, 200, JSON.stringify(list.body));
    const row = list.body.find((event: { id: number }) => event.id === match);
    assert.deepEqual(
        { status: row.game.status, scoreUs: row.game.scoreUs, scoreThem: row.game.scoreThem, opponentName: row.game.opponentName },
        { status: 'finished', scoreUs: 5, scoreThem: 2, opponentName: 'CSM Oradea' },
    );

    const single = await call(COACH, 'GET', `/events/${match}`);
    assert.equal(single.status, 200);
    assert.equal(single.body.game.status, 'finished');

    // A training carries no game at all.
    const [{ id: training }] = await db.insert(events).values({ type: 'training', title: 'Antrenament', startTime: daysAgo(2), endTime: daysAgo(2), teamId: u12 }).returning();
    const trainingRow = await call(ADMIN, 'GET', `/events/${training}`);
    assert.equal(trainingRow.body.game, null);
});

// ── 2. Join requests with a same-name child (R3-7, R3-12) ───────────────────

test('"Aprobă toți" skips a request with a same-name child; the list says who has a parent and a different birth date', async () => {
    const [same] = await db.insert(familyJoinRequests).values({
        clubId, teamId: u12, userId: strangerId, kind: 'parent', childFirstName: 'Radu', childLastName: 'Stan', childBirthDate: '2013-05-02',
    }).returning();
    const [fresh] = await db.insert(familyJoinRequests).values({
        clubId, teamId: u12, userId: strangerId, kind: 'parent', childFirstName: 'Luca', childLastName: 'Marin', childBirthDate: '2015-03-14',
    }).returning();

    const list = await call(ADMIN, 'GET', '/family-requests');
    assert.equal(list.status, 200, JSON.stringify(list.body));
    const listed = list.body.find((r: { id: number }) => r.id === same.id);
    assert.equal(listed.requester.status, 'active');
    assert.equal(listed.suggestions[0].id, radu);
    assert.equal(listed.suggestions[0].guardians, 1);
    assert.equal(listed.suggestions[0].birthMismatch, true, 'different birth year is flagged, not hidden');

    const bulk = await call(ADMIN, 'POST', '/family-requests/approve-all', { ids: [same.id, fresh.id] });
    assert.equal(bulk.status, 200, JSON.stringify(bulk.body));
    const byId = new Map(bulk.body.results.map((r: { id: number }) => [r.id, r]));
    assert.equal((byId.get(same.id) as { ok: boolean }).ok, false);
    assert.equal((byId.get(fresh.id) as { ok: boolean }).ok, true);

    const [stillPending] = await db.select().from(familyJoinRequests).where(eq(familyJoinRequests.id, same.id));
    assert.equal(stillPending.status, 'pending');
    const raduGuardians = await db.select().from(playerGuardians).where(and(eq(playerGuardians.playerId, radu), eq(playerGuardians.userId, strangerId)));
    assert.equal(raduGuardians.length, 0, 'the stranger was not linked to Radu');

    // R3-12: the new player keeps the full date, not only the year.
    const [luca] = await db.select().from(players).where(and(eq(players.firstName, 'Luca'), eq(players.lastName, 'Marin')));
    assert.equal(luca.birthYear, 2015);
    assert.equal(luca.birthDate, '2015-03-14');
});

test('a year-only request never stores a made-up 1 January', async () => {
    const [request] = await db.insert(familyJoinRequests).values({
        clubId, teamId: u12, userId: strangerId, kind: 'parent', childFirstName: 'Ilinca', childLastName: 'Dobre', childBirthDate: '2016',
    }).returning();
    const approved = await call(ADMIN, 'POST', `/family-requests/${request.id}/approve`, { playerId: 'new' });
    assert.equal(approved.status, 200, JSON.stringify(approved.body));
    const [row] = await db.select().from(players).where(eq(players.id, approved.body.playerId));
    assert.equal(row.birthYear, 2016);
    assert.equal(row.birthDate, null);
});

test('birth dates stay off the shared roster that players and parents read', async () => {
    const roster = await call(PARENT, 'GET', '/players/roster', undefined, { 'X-BCMS-Child': String(matei) });
    assert.equal(roster.status, 200, JSON.stringify(roster.body));
    for (const row of roster.body) assert.equal(row.birthDate ?? null, null);
});

// ── 3. GDPR requests (R3-13) ───────────────────────────────────────────────

test('an erasure request is listed with its deadline, closed once, and the requester is told', async () => {
    const asked = await call(PARENT, 'POST', '/privacy/erasure-request');
    assert.equal(asked.status, 201, JSON.stringify(asked.body));

    const list = await call(ADMIN, 'GET', '/privacy/requests');
    assert.equal(list.status, 200, JSON.stringify(list.body));
    assert.equal(list.body.length, 1);
    const [request] = list.body;
    assert.equal(request.requester.email, PARENT);
    assert.equal(request.daysLeft, 30);
    assert.equal(request.overdue, false);

    assert.equal((await call(PARENT, 'GET', '/privacy/requests')).status, 403);
    assert.deepEqual((await call(OTHER_ADMIN, 'GET', '/privacy/requests')).body, []);
    assert.equal((await call(OTHER_ADMIN, 'POST', `/privacy/requests/${request.id}/resolve`, {})).status, 404);
    assert.equal((await call(SUPER, 'GET', '/privacy/requests')).body.length, 1, 'the platform sees every club');

    const resolved = await call(ADMIN, 'POST', `/privacy/requests/${request.id}/resolve`, { note: 'Contul a fost șters.' });
    assert.equal(resolved.status, 200, JSON.stringify(resolved.body));
    assert.equal((await call(ADMIN, 'POST', `/privacy/requests/${request.id}/resolve`, {})).status, 409);

    assert.deepEqual((await call(ADMIN, 'GET', '/privacy/requests')).body, [], 'no longer open');
    const closed = await call(ADMIN, 'GET', '/privacy/requests?status=closed');
    assert.equal(closed.body[0].resolutionNote, 'Contul a fost șters.');
    assert.equal(closed.body[0].closedBy.name, 'Admin');

    const told = await db.select().from(notifications).where(and(eq(notifications.userId, parentId), eq(notifications.type, 'privacy_request_resolved')));
    assert.equal(told.length, 1);
    const status = await call(PARENT, 'GET', '/privacy/status');
    assert.equal(status.body.erasureRequestedAt, null, 'the profile no longer shows it as pending');
});

// ── 4. Coach feedback notes (R3-5) ─────────────────────────────────────────

test('a coach saves a feedback note on their own squad, and the family is notified', async () => {
    const [{ id: training }] = await db.insert(events).values({ type: 'training', title: 'Antrenament U12', startTime: daysAgo(3), endTime: daysAgo(3), teamId: u12 }).returning();
    const saved = await call(COACH, 'POST', `/events/${training}/attendance`, { playerAttendances: [{ playerId: matei, status: 'present', note: 'Foarte bine la apărare.' }] });
    assert.equal(saved.status, 200, JSON.stringify(saved.body));
    const sheet = await call(COACH, 'GET', `/events/${training}/attendance`);
    assert.equal(sheet.body.find((row: { playerId: number }) => row.playerId === matei).note, 'Foarte bine la apărare.');
    const feedback = await db.select().from(notifications).where(and(eq(notifications.userId, parentId), eq(notifications.eventId, training)));
    assert.equal(feedback.length, 1);
});

// ── 5. One attendance rate (P1-9, P1-10) ───────────────────────────────────

test('dashboard, Lot and the team page show the same 30-day rate; the coach counts only their teams', async () => {
    await db.delete(attendance);
    const [{ id: s1 }] = await db.insert(events).values({ type: 'training', title: 'S1', startTime: daysAgo(5), endTime: daysAgo(5), teamId: u12 }).returning();
    const [{ id: s2 }] = await db.insert(events).values({ type: 'training', title: 'S2', startTime: daysAgo(6), endTime: daysAgo(6), teamId: u14 }).returning();
    const [{ id: old }] = await db.insert(events).values({ type: 'training', title: 'Vechi', startTime: daysAgo(50), endTime: daysAgo(50), teamId: u12 }).returning();
    await db.insert(attendance).values([
        { eventId: s1, playerId: radu, teamId: u12, status: 'present', date: daysAgo(5) },
        { eventId: s1, playerId: matei, teamId: u12, status: 'absent', date: daysAgo(5) },
        { eventId: s2, playerId: ana, teamId: u14, status: 'present', date: daysAgo(6) },
        { eventId: old, playerId: radu, teamId: u12, status: 'absent', date: daysAgo(50) },
    ]);

    const dashboard = await call(ADMIN, 'GET', '/dashboard/summary');
    assert.equal(dashboard.status, 200, JSON.stringify(dashboard.body));
    const summary = await call(ADMIN, 'GET', '/players/roster/summary');
    assert.equal(summary.status, 200, JSON.stringify(summary.body));
    // 2 of 3 sessions in the last 30 days; the 50-day-old absence is out.
    assert.equal(dashboard.body.attendanceRate, 67);
    assert.equal(summary.body.attendance.rate, 67);
    assert.equal(summary.body.averageAttendance, 67);
    assert.equal(summary.body.attendancePeriod.days, 30);

    const teamStats = await call(ADMIN, 'GET', `/teams/${u12}/stats`);
    assert.equal(teamStats.body.attendance.rate, 50);
    const raduStat = teamStats.body.players.find((row: { playerId: number }) => row.playerId === radu);
    assert.equal(raduStat.attendanceRate, 100, 'the old absence is outside the period');

    const roster = await call(ADMIN, 'GET', '/players/roster');
    const unmarked = roster.body.find((row: { firstName: string }) => row.firstName === 'Ilinca');
    assert.equal(unmarked.attendanceRate, null, 'nothing marked reads as no rate, not 0%');

    const coach = await call(COACH, 'GET', '/players/roster/summary');
    assert.equal(coach.status, 200, JSON.stringify(coach.body));
    assert.equal(coach.body.teamCount, 1);
    // Radu, Matei and the two children approved above — no U14 player, no unassigned one.
    assert.equal(coach.body.athleteCount, 4);
    assert.equal(coach.body.attendance.rate, 50);
});

// ── 7. Match opponent and the L12 sheet ────────────────────────────────────

test('the opponent is stored on the match, read by L12, and the team coach is offered as head coach', async () => {
    const start = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString();
    const created = await call(ADMIN, 'POST', '/events', { type: 'match', title: 'Turneu de iarnă', startTime: start, endTime: start, teamId: u12, location: 'Sala', opponent: '  Rapid  ' });
    assert.equal(created.status, 200, JSON.stringify(created.body));
    assert.equal(created.body.opponent, 'Rapid');

    const sheet = await call(COACH, 'GET', `/l12/events/${created.body.id}`);
    assert.equal(sheet.status, 200, JSON.stringify(sheet.body));
    assert.equal(sheet.body.event.opponent, 'Rapid');
    assert.equal(sheet.body.team.coachName, 'Andrei Antrenor');

    const saved = await call(COACH, 'PUT', `/l12/events/${created.body.id}`, {
        competition: 'Liga', gender: 'M', players: [], staff: {}, captainPlayerId: null, opponent: 'Dinamo',
    });
    assert.equal(saved.status, 200, JSON.stringify(saved.body));
    const [row] = await db.select().from(events).where(eq(events.id, created.body.id));
    assert.equal(row.opponent, 'Dinamo');

    const edited = await call(ADMIN, 'PUT', `/events/${created.body.id}`, { opponent: null });
    assert.equal(edited.status, 200, JSON.stringify(edited.body));
    assert.equal(edited.body.opponent, null);
});

// ── 8. Profile and deactivating a coach ────────────────────────────────────

test('the profile refuses an empty first name and an unknown language', async () => {
    const empty = await call(PARENT, 'PATCH', '/profile/me', { firstName: '  ' });
    assert.equal(empty.status, 400);
    assert.equal(empty.body.error, 'Prenumele nu poate fi gol.');
    const klingon = await call(PARENT, 'PATCH', '/profile/me', { preferredLanguage: 'klingon' });
    assert.equal(klingon.status, 400);
    const ok = await call(PARENT, 'PATCH', '/profile/me', { firstName: 'Ioana', preferredLanguage: 'RO' });
    assert.equal(ok.status, 200, JSON.stringify(ok.body));
    const [row] = await db.select().from(users).where(eq(users.id, parentId));
    assert.equal(row.preferredLanguage, 'ro');
    assert.equal(row.firstName, 'Ioana');
});

test('deactivating a coach who leads a team asks who takes it, then hands it over', async () => {
    const ask = await call(ADMIN, 'POST', `/club-admin/accounts/${coach2Id}/deactivate`);
    assert.equal(ask.status, 409, JSON.stringify(ask.body));
    assert.equal(ask.body.code, 'coach_has_teams');
    assert.deepEqual(ask.body.teams.map((t: { id: number }) => t.id), [u14]);
    assert.ok(ask.body.candidates.some((c: { id: number }) => c.id === coachId));
    const [stillActive] = await db.select().from(users).where(eq(users.id, coach2Id));
    assert.equal(stillActive.status, 'active');

    const wrong = await call(ADMIN, 'POST', `/club-admin/accounts/${coach2Id}/deactivate`, { teamsReassignTo: parentId });
    assert.equal(wrong.status, 400, 'a parent cannot take a team');

    const done = await call(ADMIN, 'POST', `/club-admin/accounts/${coach2Id}/deactivate`, { teamsReassignTo: coachId });
    assert.equal(done.status, 200, JSON.stringify(done.body));
    const [u14Row] = await db.select().from(teams).where(eq(teams.id, u14));
    assert.equal(u14Row.coachId, coachId);
    const [disabled] = await db.select().from(users).where(eq(users.id, coach2Id));
    assert.equal(disabled.status, 'disabled');
});

test('the super admin gets the same step, and may leave the teams without a coach', async () => {
    const ask = await call(SUPER, 'PATCH', `/super-admin/users/${coachId}`, { status: 'disabled' });
    assert.equal(ask.status, 409, JSON.stringify(ask.body));
    assert.equal(ask.body.teams.length, 2);

    const done = await call(SUPER, 'PATCH', `/super-admin/users/${coachId}`, { status: 'disabled', teamsReassignTo: null });
    assert.equal(done.status, 200, JSON.stringify(done.body));
    const led = await db.select().from(teams).where(sql`${teams.coachId} IS NOT NULL`);
    assert.equal(led.length, 0);
});

test('closing a request needs an admin of the club, even for super-admin-only accounts', async () => {
    const [orphan] = await db.insert(privacyRequests).values({ userId: strangerId, clubId: null, type: 'erasure', requesterEmail: STRANGER }).returning();
    assert.equal((await call(ADMIN, 'POST', `/privacy/requests/${orphan.id}/resolve`, {})).status, 404);
    assert.equal((await call(SUPER, 'POST', `/privacy/requests/${orphan.id}/resolve`, { note: 'Rezolvat.' })).status, 200);
});
