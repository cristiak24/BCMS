import '../test/pgliteEnv';
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { and, eq } from 'drizzle-orm';
import { db } from '../db';
import { accessRequests, auditLogs, clubInviteCodes, clubs, invites, notifications, playerGuardians, players, teams, users } from '../db/schema';
import { closeDb, createSchema } from '../test/pgliteDb';
import { createClubInviteCode } from './clubInviteCodes';
import { createGuardianInvite } from './guardianInvites';
import { describeInvite, resolveInvite } from './inviteResolver';
import { completeInviteSignup } from './inviteSignup';
import { generateInviteToken as newLinkToken } from './manageAccessTokens';
import { createInviteLink } from './manageAccessRepository';
import { generateInviteToken as newEmailToken, hashInviteToken as hashEmailToken } from '../services/invitationsService';

/**
 * Every way into a club, through the same entry point the route uses: what the
 * signup form is told about a token, and what each token does on signup.
 */

let clubId = 0;
let teamId = 0;
let adminId = 0;
let seq = 0;

before(async () => {
    await createSchema();
    const [club] = await db.insert(clubs).values({ name: 'Club Test', normalizedName: 'club test' }).returning();
    clubId = club.id;
    const [admin] = await db.insert(users).values({ email: 'admin@club.ro', name: 'Admin', role: 'admin', status: 'active', clubId }).returning();
    adminId = admin.id;
    const [team] = await db.insert(teams).values({
        frbTeamId: '', name: 'U12', frbLeagueId: '', leagueName: 'Liga', frbSeasonId: '', seasonName: '2026', inviteCode: 'ABC123', clubId,
    }).returning();
    teamId = team.id;
});

after(async () => {
    // Notifications are fire-and-forget; let the last ones land before the database closes.
    await new Promise((resolve) => setTimeout(resolve, 150));
    await closeDb();
});

async function waitFor<T>(read: () => Promise<T | null | undefined | false>) {
    for (let attempt = 0; attempt < 40; attempt += 1) {
        const value = await read();
        if (value) return value;
        await new Promise((resolve) => setTimeout(resolve, 25));
    }
    throw new Error('condition not met in time');
}

const phone = '+40722000000';
// A team code form sends a full birth date; parent codes and links send the year only.
const ana = { firstName: 'Ana', lastName: 'Ionescu', birthDate: '2014-02-03' };
const anaByYear = { firstName: 'Ana', lastName: 'Ionescu', birthYear: 2014 };

function signup(inviteToken: string, extra: Record<string, unknown> = {}, who: { email?: string; existing?: { id: number; status: string } | null } = {}) {
    seq += 1;
    return completeInviteSignup({
        body: { name: `Persoana ${seq}`, phone, inviteToken, ...extra },
        identity: { uid: `uid_${seq}`, email: who.email ?? `Person${seq}@Mail.ro` },
        existingUser: who.existing ?? null,
        ip: '203.0.113.7',
        userAgent: 'test',
    });
}

async function userByEmail(email: string) {
    return (await db.select().from(users).where(eq(users.email, email.toLowerCase())))[0];
}

async function clubCode(role: 'parent' | 'player' | 'coach', maxUses = 5, team: number | null = null) {
    return createClubInviteCode({ clubId, role, teamId: team, expiresInHours: 24, maxUses, createdBy: adminId });
}

async function useCount(codeId: number) {
    return (await db.select().from(clubInviteCodes).where(eq(clubInviteCodes.id, codeId)))[0].useCount;
}

async function seedChild(firstName: string) {
    const [child] = await db.insert(players).values({ clubId, firstName, lastName: 'Garda', birthDate: '2012-12-12' } as typeof players.$inferInsert).returning();
    return child.id;
}

async function accessLink(role: 'parent' | 'player' | 'coach') {
    const token = newLinkToken(role, 60);
    await createInviteLink({
        clubId, role, token: token.rawToken, tokenHash: token.tokenHash, expiresAt: token.expiresAt, refreshIntervalMinutes: 60, createdBy: adminId,
    });
    return token.rawToken;
}

async function emailInvitation(email: string, role: 'coach' | 'accountant', expiresInMs = 24 * 60 * 60 * 1000) {
    const token = newEmailToken();
    await db.insert(invites).values({
        token, email, role, clubId, tokenHash: hashEmailToken(token), status: 'pending', expiresAt: new Date(Date.now() + expiresInMs).toISOString(), createdBy: adminId,
    });
    return token;
}

// ── what the signup form is told ──────────────────────────────────────────

test('the form is told what each kind of token is', async () => {
    const code = await clubCode('player');
    const player = await resolveInvite(code.code);
    assert.ok(player.ok);
    assert.deepEqual(
        { source: describeInvite(player.invite)?.source, role: (describeInvite(player.invite) as any).role, clubName: (describeInvite(player.invite) as any).clubName },
        { source: 'code', role: 'player', clubName: 'Club Test' },
    );

    const team = await resolveInvite('abc123');
    assert.ok(team.ok);
    const teamInfo = describeInvite(team.invite) as any;
    assert.equal(teamInfo.source, 'team');
    assert.equal(teamInfo.teamName, 'U12');
    assert.equal(teamInfo.role, null);

    const { token } = await createGuardianInvite({ clubId, playerId: await seedChild('Matei'), createdBy: adminId });
    const guardian = await resolveInvite(token);
    assert.ok(guardian.ok);
    const guardianInfo = describeInvite(guardian.invite) as any;
    assert.equal(guardianInfo.source, 'guardian');
    assert.equal(guardianInfo.childName, 'Matei Garda');

    const link = await resolveInvite(await accessLink('coach'));
    assert.ok(link.ok);
    const linkInfo = describeInvite(link.invite) as any;
    assert.equal(linkInfo.source, 'manage-access');
    assert.equal(linkInfo.role, 'coach');

    const email = await resolveInvite(await emailInvitation('new.coach@mail.ro', 'coach'));
    assert.ok(email.ok);
    assert.equal((describeInvite(email.invite) as any).source, 'invitation');
});

test('tokens that cannot be used say so', async () => {
    const unknownCode = await resolveInvite('ZZZZ9999');
    assert.equal(unknownCode.ok, false);
    const unknownTeam = await resolveInvite('QQQQQQ');
    assert.equal(unknownTeam.ok, false);
    const unknownLink = await resolveInvite('a'.repeat(64));
    assert.equal(unknownLink.ok, false);

    const spent = await createGuardianInvite({ clubId, playerId: await seedChild('Tudor'), createdBy: adminId });
    assert.ok((await signup(spent.token)).status === 201);
    const again = await resolveInvite(spent.token);
    assert.equal(again.ok, false);

    const stale = await resolveInvite(await emailInvitation('late@mail.ro', 'coach', -1000));
    assert.ok(stale.ok);
    assert.equal(describeInvite(stale.invite), null);
});

// ── signing up ────────────────────────────────────────────────────────────

test('an incomplete or unknown request is refused before anything is created', async () => {
    const before = (await db.select().from(users)).length;
    assert.equal((await completeInviteSignup({ body: {}, identity: { uid: 'u', email: 'x@y.ro' }, existingUser: null, ip: null, userAgent: null })).status, 400);
    assert.equal((await signup('ZZZZ9999')).status, 400);
    assert.equal((await signup((await clubCode('player')).code, { phone: 'abc' })).status, 400);
    assert.equal((await db.select().from(users)).length, before);
});

test('a player code lets the account in active, spends one use and is audited', async () => {
    const code = await clubCode('player');
    const out = await signup(code.code);
    assert.equal(out.status, 201);
    assert.equal((out.body.user as any).status, 'active');
    assert.equal((out.body.user as any).role, 'player');
    assert.equal(await useCount(code.id), 1);
    const logs = await db.select().from(auditLogs).where(eq(auditLogs.action, 'auth.signup_with_invite_code'));
    assert.ok(logs.some((log) => log.entityId === String(code.id) && log.ipAddress === '203.0.113.7'));
});

test('a coach code waits for the admin, who is told', async () => {
    const code = await clubCode('coach');
    const out = await signup(code.code, {}, { email: 'New.Coach@Mail.ro' });
    assert.equal(out.status, 201);
    assert.equal((out.body.user as any).status, 'pending');
    const coach = await userByEmail('new.coach@mail.ro');
    assert.equal((await db.select().from(accessRequests).where(and(eq(accessRequests.userId, coach.id), eq(accessRequests.status, 'pending')))).length, 1);
    await waitFor(async () => (await db.select().from(notifications).where(and(eq(notifications.userId, adminId), eq(notifications.type, 'access_request'))))[0]);
});

test('a parent code creates the children on the spot', async () => {
    const code = await clubCode('parent', 2);
    const out = await signup(code.code, { children: [anaByYear] }, { email: 'parent.one@mail.ro' });
    assert.equal(out.status, 201);
    assert.equal((out.body.user as any).status, 'active');
    const parent = await userByEmail('parent.one@mail.ro');
    assert.equal((await db.select().from(playerGuardians).where(eq(playerGuardians.userId, parent.id))).length, 1);
});

test('a parent code with a bad birth year is refused without spending a use', async () => {
    const code = await clubCode('parent');
    const out = await signup(code.code, { children: [{ firstName: 'Ana', lastName: 'Ionescu', birthYear: 1900 }] });
    assert.equal(out.status, 400);
    assert.match(String(out.body.error), /anul nașterii/);
    assert.equal(await useCount(code.id), 0);
    assert.equal((await signup(code.code, { children: [anaByYear], phone: '' })).status, 400);
    assert.equal(await useCount(code.id), 0);
});

test('a working account is never rewritten by a code, and the code is not spent', async () => {
    const code = await clubCode('coach');
    const out = await signup(code.code, {}, { existing: { id: adminId, status: 'active' } });
    assert.equal(out.status, 409);
    assert.equal(await useCount(code.id), 0);
});

test('a code whose team vanished gives the use back', async () => {
    const [gone] = await db.insert(teams).values({
        frbTeamId: '', name: 'U10', frbLeagueId: '', leagueName: 'Liga', frbSeasonId: '', seasonName: '2026', inviteCode: 'GONE12', clubId,
    }).returning();
    const code = await clubCode('parent', 3, gone.id);
    await db.update(teams).set({ isActive: false }).where(eq(teams.id, gone.id));
    const before = (await db.select().from(users)).length;
    await assert.rejects(() => signup(code.code, { children: [anaByYear] }), /Echipa din acest cod nu mai există/);
    assert.equal(await useCount(code.id), 0);
    assert.equal((await db.select().from(users)).length, before);
});

test('a team code parent waits as one request per child (full birth date, not a year)', async () => {
    const out = await signup('abc123', { joinAs: 'parent', children: [ana] }, { email: 'team.parent@mail.ro' });
    assert.equal(out.status, 201);
    assert.equal((out.body.user as any).status, 'pending');
    assert.equal((out.body.user as any).role, 'parent');
    const created = await userByEmail('team.parent@mail.ro');
    assert.equal(created.status, 'pending');
});

test('a team code needs the role and the children filled in, and refuses a working account', async () => {
    assert.equal((await signup('ABC123', {})).status, 400);
    assert.equal((await signup('ABC123', { joinAs: 'parent', children: [] })).status, 400);
    assert.equal((await signup('ABC123', { joinAs: 'player', birthDate: '2010-05-05' }, { existing: { id: adminId, status: 'active' } })).status, 409);
});

test('a guardian invite lets the parent in active and cannot be used twice', async () => {
    const playerId = await seedChild('Ilinca');
    const { token } = await createGuardianInvite({ clubId, playerId, createdBy: adminId });

    assert.equal((await signup(token, { phone: '' })).status, 400);
    assert.equal((await signup(token, {}, { existing: { id: adminId, status: 'active' } })).status, 409);

    const out = await signup(token, {}, { email: 'guardian@mail.ro' });
    assert.equal(out.status, 201);
    assert.equal((out.body.user as any).status, 'active');
    const parent = await userByEmail('guardian@mail.ro');
    assert.equal((await db.select().from(playerGuardians).where(and(eq(playerGuardians.playerId, playerId), eq(playerGuardians.userId, parent.id)))).length, 1);

    const second = await signup(token);
    assert.equal(second.status, 400);
    assert.match(String(second.body.error), /expirat sau a fost folosită/);
});

test('an access link waits for the admin once, however often it is opened', async () => {
    const link = await accessLink('player');
    const first = await signup(link, {}, { email: 'link.player@mail.ro' });
    assert.equal(first.status, 201);
    assert.equal((first.body.user as any).status, 'pending');
    const waiting = await userByEmail('link.player@mail.ro');
    const again = await signup(link, {}, { email: 'link.player@mail.ro', existing: { id: waiting.id, status: 'pending' } });
    assert.equal(again.status, 201);
    assert.equal((await db.select().from(accessRequests).where(and(eq(accessRequests.userId, waiting.id), eq(accessRequests.status, 'pending')))).length, 1);

    assert.equal((await signup(link, {}, { existing: { id: adminId, status: 'active' } })).status, 409);
});

test('an email invitation brings the account in with the invited role and keeps the phone', async () => {
    const token = await emailInvitation('invited.coach@mail.ro', 'coach');
    const out = await signup(token, {}, { email: 'invited.coach@mail.ro' });
    assert.equal(out.status, 201);
    assert.equal((out.body.user as any).role, 'coach');
    assert.equal((out.body.user as any).status, 'active');
    const coach = await userByEmail('invited.coach@mail.ro');
    assert.equal(coach.phone, phone);

    await assert.rejects(
        async () => signup(await emailInvitation('right@mail.ro', 'accountant'), {}, { email: 'wrong@mail.ro' }),
        /different email/,
    );
});
