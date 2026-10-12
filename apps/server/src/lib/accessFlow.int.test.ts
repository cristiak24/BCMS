import '../test/pgliteEnv';
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { and, eq } from 'drizzle-orm';
import { db } from '../db';
import { accessRequests, clubs, familyJoinRequests, notifications, playerGuardians, players, teams, users } from '../db/schema';
import { closeDb, createSchema } from '../test/pgliteDb';
import { registerWithClubCode } from './clubCodeSignup';
import { approveJoinRequest, denyJoinRequest, JoinRequestError, listJoinRequests, type Reviewer } from './familyJoinService';
import { loadOwnRequests, notifyReviewers } from './accessNotify';

/**
 * Club-code signup, join requests and their notifications against a real
 * Postgres (PGlite, in memory) — the flows the access audit changed.
 */

let clubId = 0;
let teamId = 0;
let admin: Reviewer;
let coachId = 0;
let seq = 0;

before(async () => {
    await createSchema();
    const [club] = await db.insert(clubs).values({ name: 'Club Test', normalizedName: 'club test' }).returning();
    clubId = club.id;
    const [adminRow] = await db.insert(users).values({ email: 'admin@club.ro', name: 'Admin', role: 'admin', status: 'active', clubId }).returning();
    admin = { id: adminRow.id, role: 'admin', clubId };
    const [coach] = await db.insert(users).values({ email: 'coach@club.ro', name: 'Coach', role: 'coach', status: 'active', clubId }).returning();
    coachId = coach.id;
    const [team] = await db.insert(teams).values({
        frbTeamId: '', name: 'U12', frbLeagueId: '', leagueName: 'Liga', frbSeasonId: '', seasonName: '2026', inviteCode: 'ABC123', clubId, coachId,
    }).returning();
    teamId = team.id;
});

after(async () => {
    await closeDb();
});

function signup(overrides: Partial<Parameters<typeof registerWithClubCode>[0]> & { role?: string } = {}) {
    seq += 1;
    const { role = 'parent', ...rest } = overrides;
    return registerWithClubCode({
        existingUserId: null,
        firebaseUid: `uid_${seq}`,
        email: `User${seq}@Mail.ro`,
        name: `Părinte ${seq}`,
        firstName: 'Părinte',
        lastName: String(seq),
        phone: '+40722000000',
        code: { role, clubId },
        team: { id: teamId, name: 'U12' },
        children: null,
        ...rest,
    });
}

async function waitFor<T>(read: () => Promise<T | null | undefined | false>) {
    for (let attempt = 0; attempt < 40; attempt += 1) {
        const value = await read();
        if (value) return value;
        await new Promise((resolve) => setTimeout(resolve, 25));
    }
    throw new Error('condition not met in time');
}

const matei = { firstName: 'Matei', lastName: 'Popescu', birthDate: '2016-03-02' };
let firstParentId = 0;
let secondParentId = 0;
let mateiId = 0;

test('a parent code creates the children on the team and links the parent', async () => {
    const result = await signup({ children: [matei, { firstName: 'Ana', lastName: 'Popescu', birthDate: '2013-06-01' }] });
    firstParentId = result.user.id;
    assert.equal(result.status, 'active');
    assert.equal(result.created.length, 2);
    assert.equal(result.requested.length, 0);
    assert.equal(result.user.email, result.user.email.toLowerCase());

    const links = await db.select().from(playerGuardians).where(eq(playerGuardians.userId, firstParentId));
    assert.equal(links.length, 2);
    const [row] = await db.select().from(players).where(and(eq(players.firstName, 'Matei'), eq(players.teamId, teamId)));
    mateiId = row.id;
});

test('a second parent with a child already on the roster waits for the club instead of duplicating them', async () => {
    const result = await signup({ children: [matei] });
    secondParentId = result.user.id;
    assert.equal(result.status, 'pending');
    assert.equal(result.created.length, 0);
    assert.equal(result.requested.length, 1);
    const roster = await db.select().from(players).where(eq(players.firstName, 'Matei'));
    assert.equal(roster.length, 1);
});

test('automatic approval refuses to link a second parent to a child who already has one', async () => {
    const [request] = await db.select().from(familyJoinRequests).where(eq(familyJoinRequests.userId, secondParentId));
    await assert.rejects(
        () => approveJoinRequest(admin, request.id, 'auto'),
        (error) => error instanceof JoinRequestError && error.status === 409,
    );
    const [still] = await db.select().from(users).where(eq(users.id, secondParentId));
    assert.equal(still.status, 'pending');
});

test('approving by hand links the parent, lets the account in and tells them', async () => {
    const [request] = await db.select().from(familyJoinRequests).where(eq(familyJoinRequests.userId, secondParentId));
    await approveJoinRequest(admin, request.id, mateiId);

    const [account] = await db.select().from(users).where(eq(users.id, secondParentId));
    assert.equal(account.status, 'active');
    const guardians = await db.select().from(playerGuardians).where(eq(playerGuardians.playerId, mateiId));
    assert.equal(guardians.length, 2);

    const note = await waitFor(async () => (await db.select().from(notifications)
        .where(and(eq(notifications.userId, secondParentId), eq(notifications.type, 'access_approved'))))[0]);
    assert.match(note.message, /Matei Popescu \(U12\)/);
});

test('a mixed signup lets the account in with the new child and queues the known one', async () => {
    const result = await signup({ children: [matei, { firstName: 'Luca', lastName: 'Dima', birthDate: '2016-05-11' }] });
    assert.equal(result.status, 'active');
    assert.equal(result.created.length, 1);
    assert.equal(result.requested.length, 1);
});

test('a failed signup leaves nothing behind', async () => {
    const before = await db.select().from(users);
    const playersBefore = await db.select().from(players);
    await assert.rejects(() => signup({
        firebaseUid: 'uid_broken',
        children: [{ firstName: 'Bun', lastName: 'Copil', birthDate: '2015-01-01' }, { firstName: 'Rau', lastName: 'Copil', birthDate: 'abcd-01-01' }],
    }));
    assert.equal((await db.select().from(users)).length, before.length);
    assert.equal((await db.select().from(players)).length, playersBefore.length);
});

test('a coach code waits for an admin, once, however often it is opened', async () => {
    const first = await signup({ role: 'coach', team: null });
    assert.equal(first.status, 'pending');
    const again = await signup({
        role: 'coach',
        team: null,
        existingUserId: first.user.id,
        firebaseUid: first.user.firebaseUid ?? 'uid_coach',
    });
    assert.equal(again.user.id, first.user.id);
    const waiting = await db.select().from(accessRequests)
        .where(and(eq(accessRequests.userId, first.user.id), eq(accessRequests.status, 'pending')));
    assert.equal(waiting.length, 1);
});

test('a new request reaches the club admin and the team coach, not the requester', async () => {
    await notifyReviewers({
        clubId,
        teamId,
        requesterId: secondParentId,
        requesterName: 'Elena Popescu',
        role: 'parent',
        children: ['Matei Popescu'],
        teamName: 'U12',
    });
    const rows = await db.select().from(notifications).where(eq(notifications.type, 'access_request'));
    assert.deepEqual(rows.map((row) => row.userId).sort(), [admin.id, coachId].sort());
    assert.match(rows[0].message, /Elena Popescu cere acces ca părinte pentru Matei Popescu la U12/);
});

test('a denied request shows the requester a denied waiting screen and an email-worthy notice', async () => {
    const result = await signup({ children: [matei] });
    const [request] = await db.select().from(familyJoinRequests).where(eq(familyJoinRequests.userId, result.user.id));
    assert.equal((await loadOwnRequests(result.user.id)).state, 'pending');

    await denyJoinRequest(admin, request.id);
    const own = await loadOwnRequests(result.user.id);
    assert.equal(own.state, 'denied');
    assert.equal(own.requests[0].status, 'denied');
    assert.equal(own.requests[0].detail, 'U12');

    const note = await waitFor(async () => (await db.select().from(notifications)
        .where(and(eq(notifications.userId, result.user.id), eq(notifications.type, 'access_denied'))))[0]);
    assert.match(note.message, /respinsă/);
    assert.equal((await listJoinRequests(admin, 'pending')).some((r) => r.id === request.id), false);
});
