import '../test/pgliteEnv';
import { bearer } from '../test/fakeClerk';
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { and, eq } from 'drizzle-orm';
import { db } from '../db';
import { clubs, eventResponses, events, notifications, playerGuardians, players, playersToTeams, teams, users } from '../db/schema';
import { closeDb, createSchema } from '../test/pgliteDb';
import { serve } from '../test/serve';
import eventRoutes from './eventRoutes';

/**
 * Attendance confirmation (Val 3): „Vin / Nu vin / Poate” from a player or a
 * parent (selected child), closed at the start, read by the team's coach and
 * the admin only, a single „Nu vin” notice for the coach, and „Amintește-le”.
 */

const admin = bearer('user_adm', 'adm@club.ro');
const coach14 = bearer('user_c14', 'c14@club.ro');
const coach12 = bearer('user_c12', 'c12@club.ro');
const anaAuth = bearer('user_ana', 'ana@club.ro');
const parentAuth = bearer('user_par', 'par@club.ro');
const strangerAuth = bearer('user_str', 'str@other.ro');

const HOUR = 60 * 60 * 1000;
const at = (offsetMs: number) => new Date(Date.now() + offsetMs).toISOString().replace('T', ' ').slice(0, 19);

let api: Awaited<ReturnType<typeof serve>>;
let clubId = 0;
let u12 = 0; let u14 = 0; let coachless = 0;
let ana = 0; let mihai = 0; let luca = 0; let dan = 0;
let coach14Id = 0; let adminId = 0;
let training = 0; let started = 0; let meeting = 0; let cancelled = 0; let u12Training = 0; let coachlessTraining = 0;

async function team(name: string, code: string, coachId: number | null) {
    const [row] = await db.insert(teams).values({
        frbTeamId: '', name, frbLeagueId: '', leagueName: 'Liga', frbSeasonId: '', seasonName: '2026', inviteCode: code, clubId, coachId,
    }).returning();
    return row.id;
}

async function player(firstName: string, teamId: number, extra: Partial<typeof players.$inferInsert> = {}) {
    const [row] = await db.insert(players).values({ firstName, lastName: 'Pop', name: `${firstName} Pop`, teamId, status: 'active', ...extra }).returning();
    await db.insert(playersToTeams).values({ playerId: row.id, teamId });
    return row.id;
}

async function event(teamId: number, startOffsetMs: number, extra: Partial<typeof events.$inferInsert> = {}) {
    const [row] = await db.insert(events).values({
        type: 'training', title: 'Antrenament U14', teamId, startTime: at(startOffsetMs), endTime: at(startOffsetMs + 90 * 60 * 1000), ...extra,
    }).returning();
    return row.id;
}

before(async () => {
    await createSchema();
    const [club] = await db.insert(clubs).values({ name: 'Club', normalizedName: 'club' }).returning();
    clubId = club.id;
    const [other] = await db.insert(clubs).values({ name: 'Alt club', normalizedName: 'alt club' }).returning();
    const [adm] = await db.insert(users).values({ email: 'adm@club.ro', name: 'Admin Club', role: 'admin', status: 'active', clubId, clerkUserId: 'user_adm' }).returning();
    adminId = adm.id;
    const [c14] = await db.insert(users).values({ email: 'c14@club.ro', name: 'Antrenor U14', role: 'coach', status: 'active', clubId, clerkUserId: 'user_c14' }).returning();
    coach14Id = c14.id;
    const [c12] = await db.insert(users).values({ email: 'c12@club.ro', name: 'Antrenor U12', role: 'coach', status: 'active', clubId, clerkUserId: 'user_c12' }).returning();
    const [anaUser] = await db.insert(users).values({ email: 'ana@club.ro', name: 'Ana Pop', role: 'player', status: 'active', clubId, clerkUserId: 'user_ana' }).returning();
    const [parent] = await db.insert(users).values({ email: 'par@club.ro', name: 'Maria Pop', role: 'parent', status: 'active', clubId, clerkUserId: 'user_par' }).returning();
    await db.insert(users).values({ email: 'str@other.ro', name: 'Străin', role: 'player', status: 'active', clubId: other.id, clerkUserId: 'user_str' });

    u14 = await team('U14', 'R14000', c14.id);
    u12 = await team('U12', 'R12000', c12.id);
    coachless = await team('U16', 'R16000', null);
    ana = await player('Ana', u14, { email: 'ana@club.ro', userId: anaUser.id });
    mihai = await player('Mihai', u14);
    luca = await player('Luca', u12);
    dan = await player('Dan', coachless);
    await player('Retras', u14, { status: 'inactive' });
    // The parent's first child is Mihai, the second Dan (on the coach-less team).
    await db.insert(playerGuardians).values([{ playerId: mihai, userId: parent.id }, { playerId: dan, userId: parent.id }]);

    training = await event(u14, 48 * HOUR);
    started = await event(u14, -HOUR);
    meeting = await event(u14, 48 * HOUR, { type: 'admin', title: 'Ședință' });
    cancelled = await event(u14, 48 * HOUR, { status: 'cancelled' });
    u12Training = await event(u12, 48 * HOUR, { title: 'Antrenament U12' });
    coachlessTraining = await event(coachless, 48 * HOUR, { title: 'Antrenament U16' });

    api = await serve({ '/api/events': eventRoutes });
});

after(async () => {
    await api.close();
    await closeDb();
});

const put = (eventId: number, auth: string, body: unknown, headers?: Record<string, string>) =>
    api.call('PUT', `/api/events/${eventId}/response`, { auth, body, headers });

async function declinedNotices(eventId: number, playerId: number) {
    return db.select().from(notifications)
        .where(and(eq(notifications.eventId, eventId), eq(notifications.playerId, playerId), eq(notifications.type, 'rsvp_declined')));
}

test('a player answers for themself; the answer comes back in „mine”', async () => {
    const saved = await put(training, anaAuth, { status: 'going', reason: 'ignored' });
    assert.equal(saved.status, 200);
    assert.equal(saved.body.status, 'going');
    assert.equal(saved.body.reason, null, 'a reason is only kept with „Nu vin”');

    const mine = await api.call('GET', '/api/events/responses/mine', { auth: anaAuth });
    assert.equal(mine.status, 200);
    assert.deepEqual(mine.body.map((row: { eventId: number; status: string }) => [row.eventId, row.status]), [[training, 'going']]);
    assert.equal(mine.body[0].respondedByName, 'Ana Pop');
});

test('a parent answers for the selected child (X-BCMS-Child), default the first child', async () => {
    const forMihai = await put(training, parentAuth, { status: 'maybe' });
    assert.equal(forMihai.status, 200);
    const [row] = await db.select().from(eventResponses).where(and(eq(eventResponses.eventId, training), eq(eventResponses.playerId, mihai)));
    assert.equal(row.status, 'maybe');

    // Dan is on the coach-less U16, not on U14: answering U14's training for him is refused.
    const wrongTeam = await put(training, parentAuth, { status: 'going' }, { 'x-bcms-child': String(dan) });
    assert.equal(wrongTeam.status, 403);
    // A child that isn't theirs is never reached: the header falls back to their own first child.
    const notTheirs = await put(training, parentAuth, { status: 'going' }, { 'x-bcms-child': String(ana) });
    assert.equal(notTheirs.status, 200);
    const [anaRow] = await db.select().from(eventResponses).where(and(eq(eventResponses.eventId, training), eq(eventResponses.playerId, ana)));
    assert.equal(anaRow.status, 'going', 'Ana keeps her own answer');
    await put(training, parentAuth, { status: 'maybe' });
});

test('closed at the start; meetings, cancelled events, other teams and clubs are refused', async () => {
    const late = await put(started, anaAuth, { status: 'going' });
    assert.equal(late.status, 409);
    assert.equal(late.body.errorCode, 'RESPONSES_CLOSED');
    assert.equal((await put(meeting, anaAuth, { status: 'going' })).status, 400);
    assert.equal((await put(cancelled, anaAuth, { status: 'going' })).status, 400);
    assert.equal((await put(u12Training, anaAuth, { status: 'going' })).status, 403);
    assert.equal((await put(training, strangerAuth, { status: 'going' })).status, 403);
    assert.equal((await put(training, coach14, { status: 'going' })).status, 403, 'staff do not answer for players');
    assert.equal((await put(training, anaAuth, { status: 'yes' })).status, 400);
    assert.equal((await put(training, anaAuth, { status: 'not_going', reason: 'x'.repeat(201) })).status, 400);
    assert.equal((await api.call('PUT', `/api/events/${training}/response`, { body: { status: 'going' } })).status, 401);
});

test('„Nu vin” tells the team\'s coach once, with the reason', async () => {
    const saved = await put(training, anaAuth, { status: 'not_going', reason: '  Am   școală până la 19:00 ' });
    assert.equal(saved.status, 200);
    assert.equal(saved.body.reason, 'Am școală până la 19:00');
    // The notice is sent after the answer; give it a moment.
    await new Promise((resolve) => setTimeout(resolve, 150));
    let notices = await declinedNotices(training, ana);
    assert.equal(notices.length, 1);
    assert.equal(notices[0].userId, coach14Id);
    assert.match(notices[0].message, /^Ana Pop nu vine la antrenamentul de .+\. Motiv: Am școală până la 19:00$/);

    // Back and forth: no second message.
    await put(training, anaAuth, { status: 'going' });
    await put(training, anaAuth, { status: 'not_going', reason: 'Am școală până la 19:00' });
    await new Promise((resolve) => setTimeout(resolve, 150));
    notices = await declinedNotices(training, ana);
    assert.equal(notices.length, 1);
});

test('a team without a coach: the admins hear about a „Nu vin”', async () => {
    const saved = await put(coachlessTraining, parentAuth, { status: 'not_going' }, { 'x-bcms-child': String(dan) });
    assert.equal(saved.status, 200);
    await new Promise((resolve) => setTimeout(resolve, 150));
    const notices = await declinedNotices(coachlessTraining, dan);
    assert.deepEqual(notices.map((row) => row.userId), [adminId]);
    assert.doesNotMatch(notices[0].message, /Motiv/);
});

test('the list: the team\'s coach and the admin, the active roster, counts; nobody else', async () => {
    const list = await api.call('GET', `/api/events/${training}/responses`, { auth: coach14 });
    assert.equal(list.status, 200);
    assert.equal(list.body.open, true);
    assert.equal(list.body.canRemind, true);
    assert.deepEqual(list.body.counts, { going: 0, notGoing: 1, maybe: 1, none: 0 });
    const byName = Object.fromEntries(list.body.players.map((row: { firstName: string }) => [row.firstName, row]));
    assert.deepEqual(Object.keys(byName).sort(), ['Ana', 'Mihai'], 'inactive players are left out');
    assert.equal(byName.Ana.reason, 'Am școală până la 19:00');
    assert.equal(byName.Ana.respondedByRelation, 'player');
    assert.equal(byName.Mihai.respondedByName, 'Maria Pop');
    assert.equal(byName.Mihai.respondedByRelation, 'parent');

    assert.equal((await api.call('GET', `/api/events/${training}/responses`, { auth: admin })).status, 200);
    assert.equal((await api.call('GET', `/api/events/${training}/responses`, { auth: coach12 })).status, 403);
    assert.equal((await api.call('GET', `/api/events/${training}/responses`, { auth: anaAuth })).status, 403);
    assert.equal((await api.call('GET', `/api/events/${training}/responses`, { auth: strangerAuth })).status, 403);

    const closed = await api.call('GET', `/api/events/${started}/responses`, { auth: coach14 });
    assert.equal(closed.body.open, false);
    assert.equal(closed.body.canRemind, false);
});

test('„Amintește-le”: only to players without an answer, once per 12 hours, by the team\'s coach or the admin', async () => {
    await db.delete(eventResponses).where(and(eq(eventResponses.eventId, training), eq(eventResponses.playerId, mihai)));
    assert.equal((await api.call('POST', `/api/events/${training}/responses/remind`, { auth: coach12 })).status, 403);
    assert.equal((await api.call('POST', `/api/events/${started}/responses/remind`, { auth: coach14 })).status, 409);

    const sent = await api.call('POST', `/api/events/${training}/responses/remind`, { auth: coach14 });
    assert.equal(sent.status, 200);
    assert.deepEqual(sent.body, { players: 1, notifications: 1 });
    const reminders = await db.select().from(notifications).where(and(eq(notifications.eventId, training), eq(notifications.type, 'rsvp_reminder')));
    assert.equal(reminders.length, 1);
    assert.notEqual(reminders[0].userId, coach14Id);
    assert.match(reminders[0].message, /așteaptă răspunsul/);

    const again = await api.call('POST', `/api/events/${training}/responses/remind`, { auth: admin });
    assert.equal(again.status, 429);
    assert.equal(again.body.errorCode, 'REMINDER_COOLDOWN');
    const list = await api.call('GET', `/api/events/${training}/responses`, { auth: coach14 });
    assert.ok(list.body.lastReminderAt);
});

test('deleting an event deletes its answers', async () => {
    const extra = await event(u14, 72 * HOUR);
    assert.equal((await put(extra, anaAuth, { status: 'going' })).status, 200);
    await db.delete(events).where(eq(events.id, extra));
    const left = await db.select().from(eventResponses).where(eq(eventResponses.eventId, extra));
    assert.equal(left.length, 0);
    void luca;
});
