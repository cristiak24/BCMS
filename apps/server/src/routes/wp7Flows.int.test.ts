import '../test/pgliteEnv';
import { bearer, verifyCount } from '../test/fakeClerk';
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { db } from '../db';
import { eq } from 'drizzle-orm';
import { attendance, auditLogs, clubs, events, gameStatEvents, gameStats, invites, playerGuardians, players, teams, users } from '../db/schema';
import { closeDb, createSchema } from '../test/pgliteDb';
import { serve } from '../test/serve';
import { seasonBounds } from '../lib/seasonStats';
import eventRoutes from './eventRoutes';
import gamesRouter from './games';
import teamsRouter from './teams';
import clubDocumentsRouter from './clubDocuments';
import playerRoutes from './playerRoutes';
import financeRouter from './finance';
import clubAdminRouter from './clubAdmin';

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

    server = await serve({ '/api/events': eventRoutes, '/api/games': gamesRouter, '/api/teams': teamsRouter, '/api/club-documents': clubDocumentsRouter, '/api/players': playerRoutes, '/api/finance': financeRouter, '/api/club-admin': clubAdminRouter });
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

const logOf = async (action: string) => db.select().from(auditLogs).where(eq(auditLogs.action, action));

test('D: creating, editing, cancelling and deleting an event are in the journal', async () => {
    const created = await call(ADMIN, 'POST', '/events', {
        type: 'training', title: 'Antrenament nou', startTime: at(2 * DAY), endTime: at(2 * DAY + 60 * 60 * 1000), teamId: u12,
    });
    assert.equal(created.status, 200, JSON.stringify(created.body));
    const id = created.body.id;

    assert.equal((await call(COACH, 'PUT', `/events/${id}`, { location: 'Sala 2' })).status, 200);
    // Flagging the sheet as graded alone is not an edit worth a line.
    assert.equal((await call(ADMIN, 'PUT', `/events/${id}`, { status: 'graded' })).status, 200);
    assert.equal((await call(ADMIN, 'PUT', `/events/${id}`, { status: 'cancelled' })).status, 200);
    assert.equal((await call(ADMIN, 'DELETE', `/events/${id}`)).status, 200);

    const rows = (await db.select().from(auditLogs).where(eq(auditLogs.entityId, String(id))))
        .filter((row) => row.action.startsWith('event.'));
    assert.deepEqual(rows.map((row) => row.action), ['event.created', 'event.updated', 'event.cancelled', 'event.deleted']);
    assert.deepEqual(JSON.parse(rows[1].metadata!).fields, ['location']);
    assert.ok(rows.every((row) => row.clubId === clubId));
});

test('D: attendance is one journal entry per session sitting, not one per tap', async () => {
    const before = (await logOf('attendance.saved')).length;
    const [{ id: session }] = await db.insert(events).values({
        type: 'training', title: 'Antrenament de ieri', startTime: at(-DAY), endTime: at(-DAY + 90 * 60 * 1000), teamId: u12,
    }).returning();
    const [{ id: matei }] = await db.insert(players).values({ firstName: 'Matei', lastName: 'Popescu', name: 'Matei Popescu', teamId: u12 }).returning();
    for (const [playerId, status] of [[luca, 'present'], [matei, 'absent'], [matei, 'late']] as const) {
        const res = await call(COACH, 'POST', `/events/${session}/attendance`, { playerAttendances: [{ playerId, status }] });
        assert.equal(res.status, 200, JSON.stringify(res.body));
    }
    const rows = await logOf('attendance.saved');
    assert.equal(rows.length, before + 1);
    const meta = JSON.parse(rows[rows.length - 1].metadata!);
    assert.equal(meta.marked, 2);
    assert.equal(meta.statuses[String(matei)], 'late');

    // Another person marking the same sheet gets their own line.
    await call(ADMIN, 'POST', `/events/${session}/attendance`, { playerAttendances: [{ playerId: luca, status: 'medical' }] });
    assert.equal((await logOf('attendance.saved')).length, before + 2);
});

test('D: adding a player to a team, removing them, and club documents are in the journal', async () => {
    const added = await call(ADMIN, 'POST', `/teams/${u12}/players`, { firstName: 'Radu', lastName: 'Ene' });
    assert.equal(added.status, 200, JSON.stringify(added.body));
    const bulk = await call(COACH, 'POST', `/teams/${u12}/players/bulk`, { players: [{ firstName: 'Ion', lastName: 'Marin' }, { firstName: 'Radu', lastName: 'Ene' }] });
    assert.equal(bulk.status, 201, JSON.stringify(bulk.body));
    assert.deepEqual(bulk.body.skipped, ['Radu Ene']);
    assert.equal((await call(ADMIN, 'DELETE', `/teams/${u12}/players/${added.body.id}`)).status, 200);

    const addedRows = await logOf('player.added_to_team');
    assert.equal(addedRows.length, 2, 'one created directly, one from the bulk list (the duplicate was skipped)');
    const removed = await logOf('player.removed_from_team');
    assert.deepEqual(removed.map((row) => row.entityId), [String(added.body.id)]);

    const form = new FormData();
    form.append('file', new Blob([Buffer.from('%PDF-1.4 test')], { type: 'application/pdf' }), 'regulament.pdf');
    form.append('title', 'Regulament intern');
    const upload = await fetch(`${server.base}/api/club-documents`, { method: 'POST', headers: { authorization: bearer(`test_${ADMIN}`, ADMIN) }, body: form });
    assert.equal(upload.status, 201, await upload.clone().text());
    const doc = await upload.json() as { id: number };
    assert.equal((await call(ADMIN, 'DELETE', `/club-documents/${doc.id}`)).status, 204);
    const docRows = (await db.select().from(auditLogs).where(eq(auditLogs.entityType, 'club_document'))).map((row) => row.action);
    assert.deepEqual(docRows, ['document.uploaded', 'document.deleted']);
});

test('E2: player search asks for two letters, in Romanian, whatever the parameter is called', async () => {
    for (const path of ['/players/search?q=a', '/players/search?query=a', '/players/search']) {
        const res = await call(ADMIN, 'GET', path);
        assert.equal(res.status, 400, path);
        assert.equal(res.body.error, 'Scrie cel puțin 2 caractere.');
    }
    const found = await call(ADMIN, 'GET', '/players/search?q=lu');
    assert.equal(found.status, 200, JSON.stringify(found.body));
    assert.ok(found.body.some((p: { id: number }) => p.id === luca));
});

test('F1: a team without a coach — coaches read its sessions, only the admin changes them', async () => {
    const [ana] = await db.select().from(players).where(eq(players.teamId, u14));
    const [{ id: session }] = await db.insert(events).values({
        type: 'training', title: 'Antrenament U14', startTime: at(-DAY), endTime: at(-DAY + 90 * 60 * 1000), teamId: u14,
    }).returning();

    const read = await call(COACH, 'GET', `/events/${session}/attendance`);
    assert.equal(read.status, 200, `coach still reads: ${JSON.stringify(read.body)}`);
    assert.equal((await call(COACH, 'GET', `/teams/${u14}/players`)).status, 200, 'and sees the squad');

    const mark = await call(COACH, 'POST', `/events/${session}/attendance`, { playerAttendances: [{ playerId: ana.id, status: 'present' }] });
    assert.equal(mark.status, 403, JSON.stringify(mark.body));
    assert.equal((await call(COACH, 'PUT', `/events/${session}`, { location: 'Sala 3' })).status, 403);
    assert.equal((await call(COACH, 'DELETE', `/events/${session}`)).status, 403);

    const admin = await call(ADMIN, 'POST', `/events/${session}/attendance`, { playerAttendances: [{ playerId: ana.id, status: 'present' }] });
    assert.equal(admin.status, 200, JSON.stringify(admin.body));
});

test('F2: the payments page verifies the session token once, not twice', async () => {
    const before = verifyCount();
    await call(PARENT, 'GET', '/finance/player/summary');
    assert.equal(verifyCount() - before, 1);
});

test('F3: when the email cannot be sent the invitation stays pending and the admin gets the link', async () => {
    // Tests run without RESEND_API_KEY, like a misconfigured deploy.
    const res = await call(ADMIN, 'POST', '/club-admin/accounts/invitations', { email: 'nou@club.ro', fullName: 'Antrenor nou', role: 'coach' });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    assert.equal(res.body.invitation.emailSent, false);
    assert.match(res.body.invitation.emailError, /Copiază linkul invitației/);
    assert.match(res.body.invitation.inviteUrl, /invite/);
    const [row] = await db.select().from(invites).where(eq(invites.id, res.body.invitation.id));
    assert.equal(row.status, 'pending', 'not revoked: listed, revocable, expiring as usual');

    const resent = await call(ADMIN, 'POST', `/club-admin/accounts/invite-${row.id}/resend`);
    assert.equal(resent.status, 200, JSON.stringify(resent.body));
    assert.equal(resent.body.invitation.emailSent, false);
    assert.notEqual(resent.body.invitation.inviteUrl, res.body.invitation.inviteUrl, 'a fresh link');
    const [after] = await db.select().from(invites).where(eq(invites.id, row.id));
    assert.equal(after.status, 'pending');
});
