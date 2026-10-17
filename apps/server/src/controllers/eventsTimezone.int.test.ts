import '../test/pgliteEnv';
import '../test/fakeClerk';
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { eq } from 'drizzle-orm';
import { db } from '../db';
import { clubs, events, playerGuardians, players, teams, users } from '../db/schema';
import { closeDb, createSchema } from '../test/pgliteDb';
import { bearer } from '../test/fakeClerk';
import { createServerApp } from '../app';

/**
 * Audit P0-3 / R3-4: a training typed in at 19:00 must read back as 19:00
 * Romanian time on every screen — the event page, the calendar, and a
 * parent's "Echipa mea" — whatever zone the server process runs in. Run with
 * TZ=UTC (Render) and TZ=Europe/Bucharest (a laptop): same result.
 */

const ADMIN = 'admin@tz.test';
const uidOf = (email: string) => `user_${email.split('@')[0]}`;
const PARENT = 'parinte@tz.test';
let server: Server;
let baseUrl = '';
let teamId = 0;

const bucharest = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Bucharest', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});
const wallClock = (iso: string) => bucharest.format(new Date(iso)).replace(', ', ' ');

/** What the form sends for a Romanian wall-clock time: ISO with `Z` (utils/dates.ts localDateTimeToIso). */
function formTime(day: string, time: string) {
    for (const offset of ['+03:00', '+02:00']) {
        const date = new Date(`${day}T${time}:00${offset}`);
        if (wallClock(date.toISOString()) === `${day} ${time}`) return date.toISOString();
    }
    throw new Error(`no Bucharest offset matches ${day} ${time}`);
}

function bucharestDayFromNow(days: number) {
    return bucharest.format(new Date(Date.now() + days * 864e5)).slice(0, 10);
}

async function api(email: string, path: string, init: { method?: string; body?: unknown } = {}) {
    const response = await fetch(`${baseUrl}/api${path}`, {
        method: init.method ?? 'GET',
        headers: { Authorization: bearer(uidOf(email), email), 'Content-Type': 'application/json' },
        body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });
    const text = await response.text();
    return { status: response.status, body: text ? JSON.parse(text) : null };
}

before(async () => {
    await createSchema();
    const [club] = await db.insert(clubs).values({ name: 'Club TZ', normalizedName: 'club tz' }).returning();
    await db.insert(users).values({ email: ADMIN, firebaseUid: uidOf(ADMIN), name: 'Admin', role: 'admin', status: 'active', clubId: club.id });
    const [parent] = await db.insert(users).values({ email: PARENT, firebaseUid: uidOf(PARENT), name: 'Părinte', role: 'parent', status: 'active', clubId: club.id }).returning();
    const [team] = await db.insert(teams).values({
        frbTeamId: '', name: 'U12', frbLeagueId: '', leagueName: 'Liga', frbSeasonId: '', seasonName: '2026', inviteCode: 'TZ1234', clubId: club.id,
    }).returning();
    teamId = team.id;
    const [child] = await db.insert(players).values({ firstName: 'Matei', lastName: 'Pop', name: 'Matei Pop', teamId, status: 'active' }).returning();
    await db.insert(playerGuardians).values({ playerId: child.id, userId: parent.id });

    server = createServerApp().listen(0);
    await new Promise<void>((resolve) => server.once('listening', () => resolve()));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

after(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await closeDb();
});

test('a zone-less time from an old client is refused, not guessed', async () => {
    const day = bucharestDayFromNow(5);
    const { status, body } = await api(ADMIN, '/events', {
        method: 'POST',
        body: { type: 'training', title: 'Naiv', startTime: `${day}T19:00:00`, endTime: `${day}T20:30:00`, teamId },
    });
    assert.equal(status, 400);
    assert.match(body.error, /time zone/);
});

test('an event created like the form reads back at 19:00 everywhere', async () => {
    const day = bucharestDayFromNow(10);
    const startTime = formTime(day, '19:00');
    const endTime = formTime(day, '20:30');

    const created = await api(ADMIN, '/events', {
        method: 'POST',
        body: { type: 'training', title: 'Antrenament', description: '', location: 'Sala', startTime, endTime, teamId, amount: null },
    });
    assert.equal(created.status, 200, JSON.stringify(created.body));
    assert.equal(created.body.startTime, startTime);
    assert.equal(wallClock(created.body.startTime), `${day} 19:00`);
    const id = created.body.id as number;

    // Stored as UTC wall-clock text in the zone-less column.
    const [row] = await db.select().from(events).where(eq(events.id, id));
    assert.equal(row.startTime, startTime.replace('T', ' ').replace('.000Z', ''));

    // Event page.
    const page = await api(ADMIN, `/events/${id}`);
    assert.equal(page.body.startTime, startTime);
    assert.equal(page.body.endTime, endTime);

    // Calendar (month range), for staff and for the parent.
    const range = `start=${encodeURIComponent(new Date(Date.now() - 864e5).toISOString())}&end=${encodeURIComponent(new Date(Date.now() + 40 * 864e5).toISOString())}`;
    for (const email of [ADMIN, PARENT]) {
        const calendar = await api(email, `/events?${range}`);
        const listed = (calendar.body as { id: number; startTime: string }[]).find((event) => event.id === id);
        assert.ok(listed, `${email} sees the event in the calendar`);
        assert.equal(listed.startTime, startTime);
    }

    // "Echipa mea" (parent): the team card and the team detail page.
    const myTeams = await api(PARENT, '/players/me/teams');
    assert.equal(myTeams.status, 200);
    assert.equal(myTeams.body[0].nextEvent.startTime, startTime);
    assert.equal(wallClock(myTeams.body[0].nextEvent.startTime), `${day} 19:00`);

    const detail = await api(PARENT, `/players/me/teams/${teamId}`);
    assert.equal(detail.status, 200);
    const upcoming = (detail.body.upcomingEvents as { id: number; startTime: string; endTime: string }[]).find((event) => event.id === id);
    assert.ok(upcoming);
    assert.equal(upcoming.startTime, startTime);
    assert.equal(upcoming.endTime, endTime);
});

test('a winter (+02:00) and a summer (+03:00) time both keep their wall clock', async () => {
    for (const day of ['2027-01-14', '2027-06-10']) {
        const startTime = formTime(day, '19:00');
        const created = await api(ADMIN, '/events', {
            method: 'POST',
            body: { type: 'match', title: `Meci ${day}`, startTime, endTime: formTime(day, '21:00'), teamId },
        });
        assert.equal(created.status, 200);
        const page = await api(ADMIN, `/events/${created.body.id}`);
        assert.equal(wallClock(page.body.startTime), `${day} 19:00`);
    }
});

test('an offset other than Z is normalised to UTC before storage', async () => {
    const created = await api(ADMIN, '/events', {
        method: 'POST',
        body: { type: 'training', title: 'Offset', startTime: '2027-03-02T19:00:00+02:00', endTime: '2027-03-02T20:00:00+02:00', teamId },
    });
    assert.equal(created.status, 200);
    assert.equal(created.body.startTime, '2027-03-02T17:00:00.000Z');
});
