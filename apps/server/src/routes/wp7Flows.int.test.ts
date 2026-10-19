import '../test/pgliteEnv';
import { bearer } from '../test/fakeClerk';
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { db } from '../db';
import { attendance, clubs, events, players, teams, users } from '../db/schema';
import { closeDb, createSchema } from '../test/pgliteDb';
import { serve } from '../test/serve';
import eventRoutes from './eventRoutes';

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
let u12 = 0;
let luca = 0;
let past = 0;
let nextWeek = 0;

before(async () => {
    await createSchema();
    const [club] = await db.insert(clubs).values({ name: 'Club Test', normalizedName: 'club test' }).returning();
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

    server = await serve({ '/api/events': eventRoutes });
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
