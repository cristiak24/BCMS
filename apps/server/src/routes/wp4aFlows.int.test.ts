import '../test/pgliteEnv';
import { bearer } from '../test/fakeClerk';
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { and, eq, sql } from 'drizzle-orm';
import { db, pglite } from '../db';
import { attendance, clubs, events, gameStats, playerGuardians, players, playersToTeams, teams, users } from '../db/schema';
import { closeDb, createSchema } from '../test/pgliteDb';
import { serve } from '../test/serve';
import playerRoutes from './playerRoutes';
import eventRoutes from './eventRoutes';
import gamesRouter from './games';

/**
 * Functional bugs from the 2026-10-15 audit (WP4A), through the real routes:
 * editing a player without an email, attendance limited to the event's squad
 * and stored once per player, and the delegated scorekeeper opening a match
 * whatever child they have selected.
 */

let server: Awaited<ReturnType<typeof serve>>;
const api = {
    request: (email: string, method: string, path: string, body?: unknown, headers?: Record<string, string>) =>
        server.call(method, `/api${path}`, { auth: bearer(`test_${email}`, email), body, headers }),
};
let u12 = 0;
let u14 = 0;
let luca = 0;   // U12, no email
let matei = 0;  // U12, the parent's child
let ana = 0;    // U14, the parent's other child
let radu = 0;   // U14 primary team, also on U12 through players_to_teams
let session = 0;
let match = 0;

const ADMIN = 'admin@club.ro';
const PARENT = 'parinte@club.ro';

before(async () => {
    await createSchema();
    const [club] = await db.insert(clubs).values({ name: 'Club Test', normalizedName: 'club test' }).returning();
    await db.insert(users).values({ email: ADMIN, name: 'Admin', role: 'admin', status: 'active', clubId: club.id });
    const [coach] = await db.insert(users).values({ email: 'coach@club.ro', name: 'Coach', role: 'coach', status: 'active', clubId: club.id }).returning();
    const [parent] = await db.insert(users).values({ email: PARENT, name: 'Ioana Popescu', role: 'parent', status: 'active', clubId: club.id }).returning();
    const team = (name: string, inviteCode: string, coachId: number | null) => db.insert(teams).values({
        frbTeamId: '', name, frbLeagueId: '', leagueName: 'Liga', frbSeasonId: '', seasonName: '2026', inviteCode, clubId: club.id, coachId,
    }).returning();
    [{ id: u12 }] = await team('U12', 'U12AAA', coach.id);
    [{ id: u14 }] = await team('U14', 'U14BBB', null);
    const player = (firstName: string, teamId: number, email: string | null = null) =>
        db.insert(players).values({ firstName, lastName: 'Popescu', name: `${firstName} Popescu`, teamId, email }).returning();
    [{ id: luca }] = await player('Luca', u12);
    [{ id: matei }] = await player('Matei', u12);
    [{ id: ana }] = await player('Ana', u14);
    [{ id: radu }] = await player('Radu', u14);
    await db.insert(playersToTeams).values({ playerId: radu, teamId: u12 });
    await db.insert(playerGuardians).values([{ playerId: matei, userId: parent.id }, { playerId: ana, userId: parent.id }]);

    [{ id: session }] = await db.insert(events).values({
        type: 'training', title: 'Antrenament U12', startTime: '2026-10-20 15:00:00', endTime: '2026-10-20 16:30:00', teamId: u12,
    }).returning();
    [{ id: match }] = await db.insert(events).values({
        type: 'match', title: 'Meci U12', startTime: '2026-10-25 08:00:00', endTime: '2026-10-25 10:00:00', teamId: u12,
    }).returning();
    await db.insert(gameStats).values({ eventId: match, teamId: u12, clubId: club.id, mode: 'simple', status: 'live', scorekeeperUserId: parent.id });

    server = await serve({ '/api/players': playerRoutes, '/api/events': eventRoutes, '/api/games': gamesRouter });
});

after(async () => {
    await server?.close();
    await closeDb();
});

test('a player without an email can be edited, and the email can be cleared', async () => {
    const saved = await api.request(ADMIN, 'PUT', `/players/${luca}`, {
        firstName: 'Luca', lastName: 'Popescu', email: null, number: 12, birthYear: 2015, status: 'active',
    });
    assert.equal(saved.status, 200, JSON.stringify(saved.body));
    assert.equal(saved.body.number, 12);

    await db.update(players).set({ email: 'luca@club.ro' }).where(eq(players.id, luca));
    const cleared = await api.request(ADMIN, 'PUT', `/players/${luca}`, { email: null });
    assert.equal(cleared.status, 200, JSON.stringify(cleared.body));
    const [row] = await db.select().from(players).where(eq(players.id, luca));
    assert.equal(row.email, null);
});

test('attendance refuses a player who is not on the event\'s team', async () => {
    const response = await api.request(ADMIN, 'POST', `/events/${session}/attendance`, {
        playerAttendances: [{ playerId: matei, status: 'present' }, { playerId: ana, status: 'present' }],
    });
    assert.equal(response.status, 403);
    const rows = await db.select().from(attendance).where(eq(attendance.eventId, session));
    assert.equal(rows.length, 0, 'nothing from the rejected sheet is written');
});

test('attendance accepts a player on the team through players_to_teams', async () => {
    const response = await api.request(ADMIN, 'POST', `/events/${session}/attendance`, {
        playerAttendances: [{ playerId: radu, status: 'present' }],
    });
    assert.equal(response.status, 200, JSON.stringify(response.body));
});

test('saving attendance twice at once leaves one row per player, and a status-only save keeps the note', async () => {
    const sheet = { playerAttendances: [{ playerId: matei, status: 'absent', note: 'Răcit' }, { playerId: luca, status: 'present' }] };
    const results = await Promise.all([1, 2, 3].map(() => api.request(ADMIN, 'POST', `/events/${session}/attendance`, sheet)));
    results.forEach((result) => assert.equal(result.status, 200, JSON.stringify(result.body)));

    const update = await api.request(ADMIN, 'POST', `/events/${session}/attendance`, {
        playerAttendances: [{ playerId: matei, status: 'excused' }],
    });
    assert.equal(update.status, 200);

    const rows = await db.select().from(attendance).where(and(eq(attendance.eventId, session), eq(attendance.playerId, matei)));
    assert.equal(rows.length, 1);
    assert.equal(rows[0].status, 'excused');
    assert.equal(rows[0].note, 'Răcit');

    const cleared = await api.request(ADMIN, 'POST', `/events/${session}/attendance`, {
        playerAttendances: [{ playerId: matei, status: 'excused', note: null }],
    });
    assert.equal(cleared.status, 200);
    const [after] = await db.select().from(attendance).where(and(eq(attendance.eventId, session), eq(attendance.playerId, matei)));
    assert.equal(after.note, null);
});

test('the attendance table rejects a second row for the same player and session', async () => {
    await assert.rejects(db.insert(attendance).values({ playerId: luca, eventId: session, teamId: u12, status: 'present' }));
});

test('the delegated scorekeeper opens the match whichever child is selected', async () => {
    const withMatei = await api.request(PARENT, 'GET', `/games/events/${match}`, undefined, { 'X-BCMS-Child': String(matei) });
    assert.equal(withMatei.status, 200, JSON.stringify(withMatei.body));
    assert.equal(withMatei.body.canKeep, true);

    const withAna = await api.request(PARENT, 'GET', `/games/events/${match}`, undefined, { 'X-BCMS-Child': String(ana) });
    assert.equal(withAna.status, 200, JSON.stringify(withAna.body));
    assert.equal(withAna.body.canKeep, true);
});

test('a parent who is not the scorekeeper still cannot read another team\'s match', async () => {
    const [{ id: otherMatch }] = await db.insert(events).values({
        type: 'match', title: 'Meci U12 fără delegat', startTime: '2026-10-26 08:00:00', endTime: '2026-10-26 10:00:00', teamId: u12,
    }).returning();
    const response = await api.request(PARENT, 'GET', `/games/events/${otherMatch}`, undefined, { 'X-BCMS-Child': String(ana) });
    assert.equal(response.status, 404);
});

test('migration 0026 folds existing duplicates into the newest row before adding the index', async () => {
    await db.execute(sql`DROP INDEX "attendance_event_player_unique"`);
    await db.delete(attendance);
    await db.insert(attendance).values([
        { playerId: luca, eventId: session, teamId: u12, status: 'absent', note: 'Notă veche' },
        { playerId: luca, eventId: session, teamId: u12, status: 'present' },
        { playerId: matei, eventId: session, teamId: u12, status: 'present', note: 'Prima' },
        { playerId: matei, eventId: session, teamId: u12, status: 'late', note: 'Ultima' },
        { playerId: luca, eventId: null, teamId: u12, status: 'present' },
        { playerId: luca, eventId: null, teamId: u12, status: 'present' },
    ]);

    const file = path.resolve(__dirname, '../db/migrations/0026_attendance_unique.sql');
    const statements = fs.readFileSync(file, 'utf8').split('--> statement-breakpoint');
    assert.ok(pglite, 'integration tests run on PGlite');
    for (const statement of statements) await pglite.exec(statement);

    const rows = await db.select().from(attendance).where(eq(attendance.eventId, session));
    const byPlayer = new Map(rows.map((row) => [row.playerId, row]));
    assert.equal(rows.length, 2);
    assert.equal(byPlayer.get(luca)?.status, 'present', 'the newest save wins');
    assert.equal(byPlayer.get(luca)?.note, 'Notă veche', 'a note on an older copy is kept');
    assert.equal(byPlayer.get(matei)?.note, 'Ultima');
    const legacy = await db.select().from(attendance).where(sql`${attendance.eventId} IS NULL`);
    assert.equal(legacy.length, 2, 'rows without an event are left alone');
    await assert.rejects(db.insert(attendance).values({ playerId: luca, eventId: session, teamId: u12, status: 'present' }));
});
