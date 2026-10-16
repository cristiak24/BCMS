import '../test/pgliteEnv';
import { bearer } from '../test/fakeClerk';
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { eq } from 'drizzle-orm';
import { db } from '../db';
import { clubs, invites, users } from '../db/schema';
import { closeDb, createSchema } from '../test/pgliteDb';
import { serve } from '../test/serve';
import { generateInviteToken, hashInviteToken } from '../services/invitationsService';
import invitationsRouter from './invitations';
import authRouter from './auth';

/**
 * P0-1 from the 2026-10-15 audit: whoever held an invitation link could take
 * over the invited account (or an existing admin) by posting its email, and
 * reuse the link afterwards. Driven through the real routes; only the Clerk
 * token check is faked (test/fakeClerk.ts).
 */

let clubA = 0;
let clubB = 0;
let api: Awaited<ReturnType<typeof serve>>;

before(async () => {
    await createSchema();
    [{ id: clubA }] = await db.insert(clubs).values({ name: 'Club A', normalizedName: 'club a' }).returning();
    [{ id: clubB }] = await db.insert(clubs).values({ name: 'Club B', normalizedName: 'club b' }).returning();
    api = await serve({ '/api/invitations': invitationsRouter, '/api/auth': authRouter });
});

after(async () => {
    await api.close();
    await closeDb();
});

async function invitation(email: string, role: 'admin' | 'coach', clubId: number, expiresInMs = 24 * 60 * 60 * 1000) {
    const token = generateInviteToken();
    const [row] = await db.insert(invites).values({
        token: hashInviteToken(token), tokenHash: hashInviteToken(token), email, role, clubId, status: 'pending',
        expiresAt: new Date(Date.now() + expiresInMs).toISOString(),
    }).returning();
    return { token, id: row.id };
}

async function user(email: string) {
    return (await db.select().from(users).where(eq(users.email, email)))[0];
}

async function inviteRow(id: number) {
    return (await db.select().from(invites).where(eq(invites.id, id)))[0];
}

const accept = (token: string, auth: string, body: Record<string, unknown> = {}) =>
    api.call('POST', `/api/invitations/${encodeURIComponent(token)}/accept`, { auth, body });

test('a foreign account cannot claim an invitation by posting the invited email', async () => {
    await db.insert(users).values({ email: 'admin2@club.ro', name: 'Admin B', role: 'admin', status: 'active', clubId: clubB, firebaseUid: 'user_admin2' });
    const { token, id } = await invitation('admin2@club.ro', 'admin', clubB);

    const out = await accept(token, bearer('user_attacker', 'attacker@evil.test'), { email: 'admin2@club.ro' });
    assert.equal(out.status, 400);
    assert.match(out.body.error, /altă adresă de email/);

    const admin = await user('admin2@club.ro');
    assert.equal(admin.firebaseUid, 'user_admin2');
    assert.equal(admin.clubId, clubB);
    assert.equal(await user('attacker@evil.test'), undefined);
    assert.equal((await inviteRow(id)).status, 'pending');
});

test('without a verified email the invitation is refused', async () => {
    const { token } = await invitation('noverify@club.ro', 'coach', clubA);
    const out = await accept(token, bearer('user_noverify', null), { email: 'noverify@club.ro' });
    assert.equal(out.status, 400);
    assert.match(out.body.error, /email verificată/);
    assert.equal(await user('noverify@club.ro'), undefined);
});

test('an invitation works once: a replay is refused, also through signup', async () => {
    const { token, id } = await invitation('coach.new@club.ro', 'coach', clubA);

    const first = await accept(token, bearer('user_coach_new', 'coach.new@club.ro'), { firstName: 'Ion', lastName: 'Pop' });
    assert.equal(first.status, 201);
    const coach = await user('coach.new@club.ro');
    assert.equal(coach.firebaseUid, 'user_coach_new');
    assert.equal(coach.role, 'coach');
    const row = await inviteRow(id);
    assert.equal(row.status, 'accepted');
    assert.equal(row.usedBy, coach.id);

    const replay = await accept(token, bearer('user_coach_new', 'coach.new@club.ro'));
    assert.equal(replay.status, 400);
    assert.match(replay.body.error, /deja folosită/);

    const viaSignup = await api.call('POST', '/api/auth/complete-invite-signup', {
        auth: bearer('user_coach_other', 'coach.new@club.ro'),
        body: { name: 'Alt Om', inviteToken: token, phone: '+40722000000' },
    });
    assert.equal(viaSignup.status, 400);
    assert.equal((await user('coach.new@club.ro')).firebaseUid, 'user_coach_new');

    const validated = await api.call('GET', `/api/invitations/${encodeURIComponent(token)}`);
    assert.equal(validated.status, 200);
    assert.equal(validated.body.valid, false);
    assert.equal(validated.body.invitation.status, 'accepted');
});

test('two simultaneous accepts of one link: exactly one wins', async () => {
    const { token } = await invitation('race@club.ro', 'coach', clubA);
    const auth = bearer('user_race', 'race@club.ro');
    const results = await Promise.all([accept(token, auth), accept(token, auth)]);
    assert.deepEqual(results.map((r) => r.status).sort(), [201, 400]);
});

test('an existing account bound to another sign-in is never re-pointed', async () => {
    await db.insert(users).values({ email: 'owned@club.ro', name: 'Owned', role: 'coach', status: 'active', clubId: clubA, firebaseUid: 'user_owner' });
    const { token, id } = await invitation('owned@club.ro', 'admin', clubB);

    // Same (verified) email, different Clerk account, e.g. a re-created sign-in.
    const out = await accept(token, bearer('user_second', 'owned@club.ro'));
    assert.equal(out.status, 400);
    assert.match(out.body.error, /Există deja un cont/);

    const owned = await user('owned@club.ro');
    assert.equal(owned.firebaseUid, 'user_owner');
    assert.equal(owned.role, 'coach');
    assert.equal(owned.clubId, clubA);
    assert.equal((await inviteRow(id)).status, 'pending');
});

test('a row nobody signs in to yet is linked by the invited, verified email', async () => {
    await db.insert(users).values({ email: 'prepared@club.ro', name: 'Pregătit', role: 'coach', status: 'pending', clubId: clubA });
    const { token } = await invitation('prepared@club.ro', 'coach', clubA);
    const out = await accept(token, bearer('user_prepared', 'Prepared@Club.ro'));
    assert.equal(out.status, 201);
    const prepared = await user('prepared@club.ro');
    assert.equal(prepared.firebaseUid, 'user_prepared');
    assert.equal(prepared.status, 'active');
});

test('validating a token is read-only and scoped to that invitation', async () => {
    const expired = await invitation('late@club.ro', 'coach', clubA, -60 * 60 * 1000);
    // An account already exists for another pending invite: validating some
    // other token must not mark it accepted (the old global sync did).
    await db.insert(users).values({ email: 'joined@club.ro', name: 'Joined', role: 'coach', status: 'active', clubId: clubA });
    const other = await invitation('joined@club.ro', 'coach', clubA);

    const out = await api.call('GET', `/api/invitations/${encodeURIComponent(expired.token)}/validate`);
    assert.equal(out.status, 200);
    assert.equal(out.body.valid, false);
    assert.equal(out.body.invitation.status, 'expired');

    assert.equal((await inviteRow(expired.id)).status, 'pending');
    assert.equal((await inviteRow(other.id)).status, 'pending');

    const late = await accept(expired.token, bearer('user_late', 'late@club.ro'));
    assert.equal(late.status, 400);
    assert.match(late.body.error, /expirat/);
});

test('the public token routes are rate limited', async () => {
    let last = 0;
    for (let i = 0; i < 40; i += 1) {
        last = (await api.call('GET', '/api/invitations/nu-exista')).status;
    }
    assert.equal(last, 429);
});
