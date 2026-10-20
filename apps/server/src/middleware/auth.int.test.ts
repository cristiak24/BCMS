import '../test/pgliteEnv';
import { bearer } from '../test/fakeClerk';
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { Router } from 'express';
import { eq } from 'drizzle-orm';
import { db } from '../db';
import { clubs, users } from '../db/schema';
import { closeDb, createSchema } from '../test/pgliteDb';
import { serve } from '../test/serve';
import { authenticate, type AuthenticatedRequest } from './auth';

/**
 * P1-4: a first sign-in is linked to an existing row by email. That must only
 * happen for a verified email (the fake Clerk hands out null otherwise, as
 * lib/clerkEmail.ts does) and never to a row bound to another Clerk account.
 */

let clubId = 0;
let api: Awaited<ReturnType<typeof serve>>;

before(async () => {
    await createSchema();
    [{ id: clubId }] = await db.insert(clubs).values({ name: 'Club', normalizedName: 'club' }).returning();
    const probe = Router();
    probe.get('/', authenticate, (req: AuthenticatedRequest, res) => {
        res.json({ userId: req.user?.id ?? null });
    });
    api = await serve({ '/me': probe });
});

after(async () => {
    await api.close();
    await closeDb();
});

const me = async (uid: string, email: string | null) => (await api.call('GET', '/me', { auth: bearer(uid, email) })).body.userId;
const uidOf = async (id: number) => (await db.select().from(users).where(eq(users.id, id)))[0].clerkUserId;

async function row(email: string, clerkUserId: string | null) {
    const [created] = await db.insert(users).values({ email, name: email, role: 'admin', status: 'active', clubId, clerkUserId }).returning();
    return created.id;
}

test('a row bound to another Clerk account is not taken over by email', async () => {
    const id = await row('admin@club.ro', 'user_owner');
    assert.equal(await me('user_intruder', 'admin@club.ro'), null);
    assert.equal(await uidOf(id), 'user_owner');
    assert.equal(await me('user_owner', 'admin@club.ro'), id);
});

test('without a verified email nothing is linked', async () => {
    const id = await row('fresh@club.ro', null);
    assert.equal(await me('user_fresh', null), null);
    assert.equal(await uidOf(id), null);
});

test('an unbound row is linked on the first sign-in with its verified email', async () => {
    const id = await row('Prepared@Club.ro', null);
    assert.equal(await me('user_prepared', 'prepared@club.ro'), id);
    assert.equal(await uidOf(id), 'user_prepared');
});

test('a pre-Clerk (Firebase) uid still moves to the Clerk account once', async () => {
    const id = await row('legacy@club.ro', 'Fb1x2y3z4w5v6u7t8s9r0q1p2o3');
    assert.equal(await me('user_legacy', 'legacy@club.ro'), id);
    assert.equal(await uidOf(id), 'user_legacy');
    // ...and is then owned by it.
    assert.equal(await me('user_other', 'legacy@club.ro'), null);
});
