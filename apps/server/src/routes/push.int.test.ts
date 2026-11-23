import '../test/pgliteEnv';
import { bearer } from '../test/fakeClerk';
import test, { after, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import webpush from 'web-push';
import { and, desc, eq } from 'drizzle-orm';
import { db } from '../db';
import { clubs, events, notifications, playerGuardians, players, playersToTeams, pushPreferences, pushSubscriptions, teams, users } from '../db/schema';
import { closeDb, createSchema } from '../test/pgliteDb';
import { serve } from '../test/serve';
import { flushPush, PUSH_BODY, setPushSenderForTests, type PushTarget } from '../lib/push';
import { notifyEventChange, notifyResponseDeclined, sendPaymentReminders } from '../lib/notifications';
import pushRoutes from './push';
import eventRoutes from './eventRoutes';

/**
 * Web push (Val 3B): devices and preferences per account, a push copy of the
 * in-app notifications with only a title and a link, dead subscriptions
 * dropped, and push off without the VAPID variables.
 */

const adminAuth = bearer('user_adm', 'adm@club.ro');
const coachAuth = bearer('user_coach', 'coach@club.ro');
const parentAuth = bearer('user_par', 'par@club.ro');
const anaAuth = bearer('user_ana', 'ana@club.ro');
const accountantAuth = bearer('user_acc', 'acc@club.ro');

const HOUR = 60 * 60 * 1000;
const at = (offsetMs: number) => new Date(Date.now() + offsetMs).toISOString().replace('T', ' ').slice(0, 19);

type Sent = { target: PushTarget; payload: { title: string; body: string; url: string; tag: string }; options: { TTL: number; topic?: string } };
let sent: Sent[] = [];
let failWith: Map<string, number> = new Map();

let api: Awaited<ReturnType<typeof serve>>;
let clubId = 0; let u14 = 0;
let parentId = 0; let coachId = 0; let anaUserId = 0;
let mihai = 0; let ana = 0; let training = 0;

const keys = webpush.generateVAPIDKeys();
// A valid-looking browser key pair; the fake sender never encrypts anything.
const browserKeys = { p256dh: 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM', auth: 'tBHItJI5svbpez7KI4CCXg' }; // ggignore — fake browser subscription for tests, not a credential
const endpointFor = (name: string) => `https://push.example.test/send/${name}`;

function enablePush() {
    process.env.VAPID_PUBLIC_KEY = keys.publicKey;
    process.env.VAPID_PRIVATE_KEY = keys.privateKey;
    process.env.VAPID_SUBJECT = 'mailto:contact@bcms.ro';
    setPushSenderForTests(async (target, payload, options) => {
        const status = failWith.get(target.endpoint);
        if (status) throw Object.assign(new Error(`push ${status}`), { statusCode: status });
        sent.push({ target, payload: JSON.parse(payload), options });
    });
}

function disablePush() {
    delete process.env.VAPID_PUBLIC_KEY;
    delete process.env.VAPID_PRIVATE_KEY;
    delete process.env.VAPID_SUBJECT;
    setPushSenderForTests(null);
}

const subscribe = (auth: string, name: string, label = 'iPhone · aplicația') =>
    api.call('PUT', '/api/push/subscription', { auth, body: { endpoint: endpointFor(name), keys: browserKeys, label } });

before(async () => {
    await createSchema();
    const [club] = await db.insert(clubs).values({ name: 'Club', normalizedName: 'club' }).returning();
    clubId = club.id;
    await db.insert(users).values({ email: 'adm@club.ro', name: 'Admin Club', role: 'admin', status: 'active', clubId, clerkUserId: 'user_adm' });
    const [coach] = await db.insert(users).values({ email: 'coach@club.ro', name: 'Antrenor', role: 'coach', status: 'active', clubId, clerkUserId: 'user_coach' }).returning();
    coachId = coach.id;
    const [parent] = await db.insert(users).values({ email: 'par@club.ro', name: 'Maria Pop', role: 'parent', status: 'active', clubId, clerkUserId: 'user_par' }).returning();
    parentId = parent.id;
    const [anaUser] = await db.insert(users).values({ email: 'ana@club.ro', name: 'Ana Ionescu', role: 'player', status: 'active', clubId, clerkUserId: 'user_ana' }).returning();
    anaUserId = anaUser.id;
    await db.insert(users).values({ email: 'acc@club.ro', name: 'Contabil', role: 'accountant', status: 'active', clubId, clerkUserId: 'user_acc' });

    const [team] = await db.insert(teams).values({
        frbTeamId: '', name: 'U14', frbLeagueId: '', leagueName: 'Liga', frbSeasonId: '', seasonName: '2026', inviteCode: 'P14000', clubId, coachId,
    }).returning();
    u14 = team.id;
    const [m] = await db.insert(players).values({ firstName: 'Mihai', lastName: 'Pop', name: 'Mihai Pop', teamId: u14, status: 'active' }).returning();
    mihai = m.id;
    const [a] = await db.insert(players).values({ firstName: 'Ana', lastName: 'Ionescu', name: 'Ana Ionescu', teamId: u14, status: 'active', email: 'ana@club.ro', userId: anaUserId }).returning();
    ana = a.id;
    await db.insert(playersToTeams).values([{ playerId: mihai, teamId: u14 }, { playerId: ana, teamId: u14 }]);
    await db.insert(playerGuardians).values({ playerId: mihai, userId: parentId });
    const [ev] = await db.insert(events).values({
        type: 'training', title: 'Antrenament U14', teamId: u14, startTime: at(48 * HOUR), endTime: at(50 * HOUR),
    }).returning();
    training = ev.id;

    api = await serve({ '/api/push': pushRoutes, '/api/events': eventRoutes });
});

beforeEach(async () => {
    enablePush();
    sent = [];
    failWith = new Map();
    await db.delete(pushSubscriptions);
    await db.delete(pushPreferences);
});

after(async () => {
    disablePush();
    await api.close();
    await closeDb();
});

test('config gives the public key; without the VAPID variables push is off', async () => {
    const on = await api.call('GET', '/api/push/config', { auth: parentAuth });
    assert.deepEqual(on.body, { enabled: true, publicKey: keys.publicKey });

    disablePush();
    const off = await api.call('GET', '/api/push/config', { auth: parentAuth });
    assert.deepEqual(off.body, { enabled: false, publicKey: null });
    assert.equal((await subscribe(parentAuth, 'p1')).status, 503);
    // The in-app notification is still saved; nothing is sent.
    const before = (await db.select().from(notifications).where(eq(notifications.userId, parentId))).length;
    await notifyEventChange({ kind: 'cancelled', teamId: u14, eventId: training, title: 'Antrenament U14', startTime: at(48 * HOUR) });
    await flushPush();
    assert.equal((await db.select().from(notifications).where(eq(notifications.userId, parentId))).length, before + 1);
    assert.equal(sent.length, 0);

    const unauth = await api.call('GET', '/api/push/config');
    assert.equal(unauth.status, 401, 'Bearer only');
});

test('a family subscribes a device; the profile lists it with the family kinds, all on', async () => {
    const bad = await api.call('PUT', '/api/push/subscription', { auth: parentAuth, body: { endpoint: 'http://insecure.test/x', keys: browserKeys } });
    assert.equal(bad.status, 400);
    const badKeys = await api.call('PUT', '/api/push/subscription', { auth: parentAuth, body: { endpoint: endpointFor('x'), keys: { p256dh: '<script>', auth: 'a' } } });
    assert.equal(badKeys.status, 400);

    assert.equal((await subscribe(parentAuth, 'p1', 'iPhone · aplicația <b>')).status, 200);
    const me = await api.call('GET', '/api/push/me', { auth: parentAuth });
    assert.equal(me.status, 200);
    assert.deepEqual(me.body.kinds, ['event_new', 'event_changed', 'rsvp_reminder', 'payment_overdue']);
    assert.deepEqual(me.body.preferences, { event_new: true, event_changed: true, rsvp_reminder: true, payment_overdue: true });
    assert.equal(me.body.devices.length, 1);
    assert.equal(me.body.devices[0].label, 'iPhone · aplicația b', 'markup stripped from the label');

    const coachMe = await api.call('GET', '/api/push/me', { auth: coachAuth });
    assert.deepEqual(coachMe.body.kinds, ['rsvp_declined']);
    const accountant = await api.call('GET', '/api/push/me', { auth: accountantAuth });
    assert.deepEqual(accountant.body.kinds, [], 'no card for roles that receive nothing');
    assert.equal((await subscribe(accountantAuth, 'acc')).status, 403);
});

test('a browser used by a second account moves to it (shared phone)', async () => {
    await subscribe(parentAuth, 'shared');
    await subscribe(anaAuth, 'shared');
    const rows = await db.select().from(pushSubscriptions).where(eq(pushSubscriptions.endpoint, endpointFor('shared')));
    assert.equal(rows.length, 1);
    assert.equal(rows[0].userId, anaUserId);
});

test('at most ten devices per account: the oldest goes', async () => {
    // The coach's account: subscribing is rate-limited per account (20 / 10 min).
    for (let index = 0; index < 11; index += 1) await subscribe(coachAuth, `many${index}`);
    const rows = await db.select().from(pushSubscriptions).where(eq(pushSubscriptions.userId, coachId));
    assert.equal(rows.length, 10);
    assert.ok(!rows.some((row) => row.endpoint === endpointFor('many0')));
});

test('a cancelled session: one push with a title and a link — no names, times or places', async () => {
    await subscribe(parentAuth, 'p1');
    await subscribe(anaAuth, 'a1');
    await notifyEventChange({ kind: 'cancelled', teamId: u14, eventId: training, title: 'Antrenament U14', startTime: at(48 * HOUR), location: 'Sala Mare' });
    await flushPush();

    const toParent = sent.find((row) => row.target.endpoint === endpointFor('p1'));
    assert.ok(toParent);
    assert.deepEqual(Object.keys(toParent.payload).sort(), ['body', 'tag', 'title', 'url']);
    assert.equal(toParent.payload.title, 'Eveniment anulat');
    assert.equal(toParent.payload.body, PUSH_BODY);
    assert.equal(toParent.payload.tag, `ev${training}`);
    assert.equal(toParent.options.topic, `ev${training}`);
    const [notice] = await db.select().from(notifications)
        .where(and(eq(notifications.userId, parentId), eq(notifications.eventId, training), eq(notifications.type, 'event_cancelled')))
        .orderBy(desc(notifications.id)).limit(1);
    assert.equal(toParent.payload.url, `/schedule?event=${training}&child=${mihai}&n=${notice.id}`, 'the parent lands on the right child');
    const text = JSON.stringify(toParent.payload);
    for (const secret of ['Mihai', 'Pop', 'U14', 'Sala', 'Antrenament']) assert.ok(!text.includes(secret), `no "${secret}" in the payload`);

    const toAna = sent.find((row) => row.target.endpoint === endpointFor('a1'));
    assert.ok(toAna);
    assert.ok(!toAna.payload.url.includes('child='), 'a player has no child to pick');
});

test('a switched-off kind sends nothing; the others still go', async () => {
    await subscribe(parentAuth, 'p1');
    const wrongKind = await api.call('PUT', '/api/push/preferences', { auth: parentAuth, body: { rsvp_declined: false } });
    assert.equal(wrongKind.status, 400, 'a parent has no „Absențe anunțate”');
    const saved = await api.call('PUT', '/api/push/preferences', { auth: parentAuth, body: { event_changed: false } });
    assert.equal(saved.status, 200);
    assert.equal(saved.body.preferences.event_changed, false);
    assert.equal(saved.body.preferences.event_new, true);

    await notifyEventChange({ kind: 'rescheduled', teamId: u14, eventId: training, title: 'Antrenament U14', startTime: at(49 * HOUR) });
    await flushPush();
    assert.equal(sent.length, 0);

    await sendPaymentReminders([{ playerId: mihai, playerName: 'Mihai Pop', outstanding: 200, overdue: 150 }]);
    await flushPush();
    assert.equal(sent.length, 1);
    assert.equal(sent[0].payload.title, 'Plată restantă');
    assert.match(sent[0].payload.url, new RegExp(`^/payments\\?child=${mihai}&n=\\d+$`));
    assert.ok(!JSON.stringify(sent[0].payload).includes('150'), 'no amount in the payload');
});

test('„Nu vine” reaches the coach on the attendance of that event', async () => {
    await subscribe(coachAuth, 'c1');
    await notifyResponseDeclined({ clubId, coachIds: [coachId], eventId: training, playerId: mihai, playerName: 'Mihai Pop', noun: 'antrenamentul', startTime: at(48 * HOUR), reason: 'Bolnav' });
    await flushPush();
    assert.equal(sent.length, 1);
    assert.equal(sent[0].payload.title, 'Absență anunțată');
    assert.match(sent[0].payload.url, new RegExp(`^/coach/attendance\\?event=${training}&n=\\d+$`));
    assert.ok(!JSON.stringify(sent[0].payload).includes('Bolnav'));
});

test('an event created in the app: „Eveniment nou” in the app and as push', async () => {
    await subscribe(parentAuth, 'p1');
    const created = await api.call('POST', '/api/events', {
        auth: adminAuth,
        body: { type: 'match', title: 'Meci amical', teamId: u14, startTime: new Date(Date.now() + 72 * HOUR).toISOString(), endTime: new Date(Date.now() + 74 * HOUR).toISOString() },
    });
    assert.equal(created.status, 200, JSON.stringify(created.body));
    // The notification runs after the response.
    let rows: Array<typeof notifications.$inferSelect> = [];
    for (let attempt = 0; attempt < 50 && !rows.length; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 20));
        rows = await db.select().from(notifications).where(and(eq(notifications.userId, parentId), eq(notifications.type, 'event_created')));
    }
    assert.equal(rows.length, 1);
    assert.equal(rows[0].title, 'Eveniment nou');
    await flushPush();
    assert.equal(sent.length, 1);
    assert.equal(sent[0].payload.title, 'Eveniment nou');
    assert.equal(sent[0].payload.url, `/schedule?event=${created.body.id}&child=${mihai}&n=${rows[0].id}`);
});

test('a past event creates no „Eveniment nou”', async () => {
    const created = await api.call('POST', '/api/events', {
        auth: adminAuth,
        body: { type: 'training', title: 'Antrenament trecut', teamId: u14, startTime: new Date(Date.now() - 72 * HOUR).toISOString(), endTime: new Date(Date.now() - 70 * HOUR).toISOString() },
    });
    assert.equal(created.status, 200, JSON.stringify(created.body));
    await new Promise((resolve) => setTimeout(resolve, 100));
    const rows = await db.select().from(notifications).where(and(eq(notifications.eventId, created.body.id), eq(notifications.type, 'event_created')));
    assert.equal(rows.length, 0);
});

test('404/410 delete the subscription at once; other errors after five in a row', async () => {
    await subscribe(parentAuth, 'gone');
    await subscribe(parentAuth, 'flaky');
    failWith.set(endpointFor('gone'), 410);
    failWith.set(endpointFor('flaky'), 500);
    await notifyEventChange({ kind: 'cancelled', teamId: u14, eventId: training, title: 'x', startTime: at(48 * HOUR) });
    await flushPush();
    let rows = await db.select().from(pushSubscriptions).where(eq(pushSubscriptions.userId, parentId));
    assert.deepEqual(rows.map((row) => [row.endpoint, row.failureCount]), [[endpointFor('flaky'), 1]]);

    for (let index = 0; index < 4; index += 1) {
        await notifyEventChange({ kind: 'cancelled', teamId: u14, eventId: training, title: 'x', startTime: at(48 * HOUR) });
        await flushPush();
    }
    rows = await db.select().from(pushSubscriptions).where(eq(pushSubscriptions.userId, parentId));
    assert.equal(rows.length, 0);
});

test('unsubscribe and remove touch only my own devices; the test push goes to this device', async () => {
    await subscribe(parentAuth, 'p1');
    await subscribe(anaAuth, 'a1');
    const [anaDevice] = await db.select().from(pushSubscriptions).where(eq(pushSubscriptions.userId, anaUserId));

    assert.equal((await api.call('DELETE', `/api/push/devices/${anaDevice.id}`, { auth: parentAuth })).status, 404);
    await api.call('POST', '/api/push/unsubscribe', { auth: parentAuth, body: { endpoint: endpointFor('a1') } });
    assert.equal((await db.select().from(pushSubscriptions).where(eq(pushSubscriptions.userId, anaUserId))).length, 1, 'Ana keeps her device');

    const probe = await api.call('POST', '/api/push/test', { auth: parentAuth, body: { endpoint: endpointFor('p1') } });
    assert.equal(probe.status, 200);
    assert.equal(sent.length, 1);
    assert.equal(sent[0].payload.title, 'Notificările funcționează');
    const notMine = await api.call('POST', '/api/push/test', { auth: parentAuth, body: { endpoint: endpointFor('a1') } });
    assert.equal(notMine.status, 404);

    assert.equal((await api.call('POST', '/api/push/unsubscribe', { auth: parentAuth, body: { endpoint: endpointFor('p1') } })).status, 200);
    assert.equal((await db.select().from(pushSubscriptions).where(eq(pushSubscriptions.userId, parentId))).length, 0);
    assert.equal((await api.call('DELETE', `/api/push/devices/${anaDevice.id}`, { auth: anaAuth })).status, 200);
});
