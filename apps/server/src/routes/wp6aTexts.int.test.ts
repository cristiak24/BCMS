import '../test/pgliteEnv';
import { bearer } from '../test/fakeClerk';
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { eq } from 'drizzle-orm';
import { db } from '../db';
import { clubs, notifications, playerGuardians, players, playersToTeams, teams, users } from '../db/schema';
import { closeDb, createSchema } from '../test/pgliteDb';
import { serve } from '../test/serve';
import profileRoutes from './profile';
import { notifyPaymentRecorded } from '../lib/notifications';

/**
 * Texts from the 2026-10-15 audit (WP6A) that the server writes: the profile's
 * teams (R3-9, R3-15) and the child named in a payment notification (R3-14).
 */

let server: Awaited<ReturnType<typeof serve>>;
const call = (email: string, method: string, url: string, headers?: Record<string, string>) =>
    server.call(method, `/api${url}`, { auth: bearer(`test_${email}`, email), headers });

const COACH = 'coach@club.ro';
const PARENT = 'parinte@club.ro';

let parentId = 0;
let matei = 0;
let ana = 0;

before(async () => {
    await createSchema();
    const [club] = await db.insert(clubs).values({ name: 'Club Test', normalizedName: 'club test' }).returning();
    const clubId = club.id;
    const [coach] = await db.insert(users).values({ email: COACH, name: 'Andrei Antrenor', role: 'coach', status: 'active', clubId }).returning();
    [{ id: parentId }] = await db.insert(users).values({ email: PARENT, name: 'Ioana Popescu', role: 'parent', status: 'active', clubId }).returning();

    const team = (name: string, inviteCode: string, coachId: number | null) => db.insert(teams).values({
        frbTeamId: '', name, frbLeagueId: '', leagueName: 'Liga', frbSeasonId: '', seasonName: '2026', inviteCode, clubId, coachId,
    }).returning();
    const [u12] = await team('U12 Masculin', 'U12AAA', coach.id);
    const [u14] = await team('U14 Feminin', 'U14BBB', null);
    await team('U16 Masculin', 'U16CCC', coach.id);

    [{ id: matei }] = await db.insert(players).values({ firstName: 'Matei', lastName: 'Popescu', name: 'Matei Popescu', teamId: u12.id }).returning();
    [{ id: ana }] = await db.insert(players).values({ firstName: 'Ana', lastName: 'Popescu', name: 'Ana Popescu', teamId: u14.id }).returning();
    await db.insert(playersToTeams).values([{ playerId: matei, teamId: u12.id }, { playerId: ana, teamId: u14.id }]);
    await db.insert(playerGuardians).values([{ playerId: matei, userId: parentId }, { playerId: ana, userId: parentId }]);

    server = await serve({ '/api/profile': profileRoutes });
});

after(async () => {
    await server?.close();
    await closeDb();
});

test("a coach's profile lists the teams they coach (it read „Neatribuit”)", async () => {
    const res = await call(COACH, 'GET', '/profile/me');
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.teamNames, ['U12 Masculin', 'U16 Masculin']);
});

test("a parent's profile lists every child's team, whichever child is selected", async () => {
    for (const child of [matei, ana]) {
        const res = await call(PARENT, 'GET', '/profile/me', { 'X-BCMS-Child': String(child) });
        assert.equal(res.status, 200);
        assert.deepEqual(res.body.teamNames, ['U12 Masculin', 'U14 Feminin']);
    }
});

test('a payment notification names the child it is for', async () => {
    await notifyPaymentRecorded(ana, 152.5, 'Cotizație octombrie');
    const rows = await db.select().from(notifications).where(eq(notifications.userId, parentId));
    assert.equal(rows.length, 1);
    assert.equal(rows[0].title, 'Plată înregistrată · Ana');
    assert.equal(rows[0].message, 'Am înregistrat plata de 152,5 RON pentru Ana (Cotizație octombrie). Mulțumim!');
});
