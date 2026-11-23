import '../test/pgliteEnv';
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { eq } from 'drizzle-orm';
import { db } from '../db';
import { clubs, users } from '../db/schema';
import { closeDb, createSchema } from '../test/pgliteDb';
import { findOrLinkUser } from '../lib/identityLink';
import { maskEmail, resetClerkLinks } from './resetClerkLinks';

/** Trecerea pe instanța Clerk de producție: legăturile se golesc, emailul verificat le refă. */

before(async () => {
    await createSchema();
    const [club] = await db.insert(clubs).values({ name: 'Club Lansare', normalizedName: 'club lansare' }).returning();
    await db.insert(users).values([
        { email: 'admin@club.ro', name: 'Admin', role: 'admin', status: 'active', clubId: club.id, clerkUserId: 'user_devAdmin' },
        { email: 'antrenor@club.ro', name: 'Antrenor', role: 'coach', status: 'active', clubId: club.id, clerkUserId: 'user_devCoach' },
        { email: 'vechi@club.ro', name: 'Cont vechi', role: 'parent', status: 'active', clubId: club.id, clerkUserId: 'firebaseUid123' },
        { email: 'nou@club.ro', name: 'Invitat', role: 'player', status: 'pending', clubId: club.id },
    ]);
});

after(async () => {
    await closeDb();
});

test('before the reset, a production-instance id cannot take over a row bound to a dev-instance id', async () => {
    const linked = await findOrLinkUser({ uid: 'user_prodAdmin', email: 'admin@club.ro' });
    assert.equal(linked, null);
});

test('dry run lists the linked accounts and writes nothing', async () => {
    const result = await resetClerkLinks({ apply: false });
    assert.equal(result.applied, false);
    assert.equal(result.cleared, 0);
    assert.deepEqual(result.accounts.map((row) => row.email), ['admin@club.ro', 'antrenor@club.ro', 'vechi@club.ro']);

    const [admin] = await db.select().from(users).where(eq(users.email, 'admin@club.ro'));
    assert.equal(admin.clerkUserId, 'user_devAdmin');
});

test('--apply clears every link and leaves roles, status and club untouched', async () => {
    const before = await db.select().from(users).orderBy(users.id);
    const result = await resetClerkLinks({ apply: true });
    assert.equal(result.applied, true);
    assert.equal(result.cleared, 3);

    const rows = await db.select().from(users).orderBy(users.id);
    assert.ok(rows.every((row) => row.clerkUserId === null));
    assert.deepEqual(
        rows.map(({ email, role, status, clubId }) => ({ email, role, status, clubId })),
        before.map(({ email, role, status, clubId }) => ({ email, role, status, clubId })),
    );
});

test('after the reset, the first sign-in with a verified email links the row to the new id', async () => {
    const linked = await findOrLinkUser({ uid: 'user_prodAdmin', email: 'Admin@Club.ro' });
    assert.ok(linked);
    assert.equal(linked.email, 'admin@club.ro');
    assert.equal(linked.clerkUserId, 'user_prodAdmin');

    // Another production account with an unrelated email links to nothing.
    assert.equal(await findOrLinkUser({ uid: 'user_stranger', email: 'altcineva@club.ro' }), null);
    // Without a verified email nothing is linked.
    assert.equal(await findOrLinkUser({ uid: 'user_prodCoach', email: null }), null);
});

test('running it again is a no-op apart from accounts already re-linked', async () => {
    const result = await resetClerkLinks({ apply: false });
    assert.deepEqual(result.accounts.map((row) => row.clerkUserId), ['user_prodAdmin']);
});

test('maskEmail keeps the domain and the first letter only', () => {
    assert.equal(maskEmail('ana.pop@club.ro'), 'a***@club.ro');
    assert.equal(maskEmail('fara-arond'), '***');
});
