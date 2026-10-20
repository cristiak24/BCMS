import '../test/pgliteEnv';
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { and, eq } from 'drizzle-orm';
import { db } from '../db';
import { accessRequests, clubs, familyJoinRequests, playerGuardians, players, playersToTeams, teams, users } from '../db/schema';
import { closeDb, createSchema } from '../test/pgliteDb';
import { ensurePendingAccessRequest, registerWithAccessLink, registerWithGuardianInvite, registerWithTeamCode, type SignupIdentity } from './accountSignup';
import { registerWithClubCode } from './clubCodeSignup';
import { createGuardianInvite } from './guardianInvites';
import { placeApprovedPlayerOnTeam } from './manageAccessRepository';

/**
 * The team-code, access-link and guardian-invite signups against a real
 * Postgres (PGlite, in memory): each lands as one unit or not at all.
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
    await closeDb();
});

function identity(overrides: Partial<SignupIdentity> = {}): SignupIdentity {
    seq += 1;
    return {
        existingUserId: null,
        clerkUserId: `uid_${seq}`,
        email: `Person${seq}@Mail.ro`,
        name: `Persoana ${seq}`,
        firstName: 'Persoana',
        lastName: String(seq),
        ...overrides,
    };
}

const phone = '+40722000000';
const ana = { firstName: 'Ana', lastName: 'Ionescu', birthDate: '2014-02-03' };
const luca = { firstName: 'Luca', lastName: 'Ionescu', birthDate: '2016-07-09' };
const badChild = { firstName: 'Rau', lastName: 'Copil', birthDate: 'abcd-01-01' };

async function countUsers() {
    return (await db.select().from(users)).length;
}

test('a team code parent waits as one request per child, email lowercase, no children created yet', async () => {
    const { user, requests } = await registerWithTeamCode({
        ...identity(),
        signup: { kind: 'parent', phone, children: [ana, luca] },
        team: { id: teamId, clubId },
    });
    assert.equal(user.status, 'pending');
    assert.equal(user.role, 'parent');
    assert.equal(user.clubId, clubId);
    assert.equal(user.email, user.email.toLowerCase());
    assert.equal(requests.length, 2);
    assert.equal((await db.select().from(players).where(eq(players.firstName, 'Ana'))).length, 0);
});

test('a team code player waits as a single request about themselves', async () => {
    const { user, requests } = await registerWithTeamCode({
        ...identity({ firstName: 'Dan', lastName: 'Sportivu' }),
        signup: { kind: 'player', phone, birthDate: '2010-05-05' },
        team: { id: teamId, clubId },
    });
    assert.equal(user.role, 'player');
    assert.equal(requests.length, 1);
    assert.equal(requests[0].kind, 'player');
    assert.equal(requests[0].childFirstName, 'Dan');
});

test('a team code signup that fails leaves no account behind', async () => {
    const before = await countUsers();
    const requestsBefore = (await db.select().from(familyJoinRequests)).length;
    await assert.rejects(() => registerWithTeamCode({
        ...identity({ clerkUserId: 'uid_broken_team' }),
        signup: { kind: 'parent', phone, children: [ana] },
        team: { id: 999_999, clubId },
    }));
    assert.equal(await countUsers(), before);
    assert.equal((await db.select().from(familyJoinRequests)).length, requestsBefore);
});

test('retrying with the same unfinished account rewrites it instead of adding another', async () => {
    const first = await registerWithTeamCode({
        ...identity(),
        signup: { kind: 'player', phone, birthDate: '2010-05-05' },
        team: { id: teamId, clubId },
    });
    const before = await countUsers();
    const again = await registerWithTeamCode({
        ...identity({ existingUserId: first.user.id, clerkUserId: first.user.clerkUserId ?? 'uid_retry' }),
        signup: { kind: 'parent', phone, children: [luca] },
        team: { id: teamId, clubId },
    });
    assert.equal(again.user.id, first.user.id);
    assert.equal(again.user.role, 'parent');
    assert.equal(await countUsers(), before);
});

test('an access link for a player waits for an admin once, however often it is opened', async () => {
    const first = await registerWithAccessLink({
        ...identity(),
        phone,
        link: { role: 'player', clubId },
        team: null,
        children: null,
    });
    assert.equal(first.user.status, 'pending');
    assert.equal(first.queuedForTeam, false);
    await registerWithAccessLink({
        ...identity({ existingUserId: first.user.id, clerkUserId: first.user.clerkUserId ?? 'uid_link' }),
        phone,
        link: { role: 'player', clubId },
        team: null,
        children: null,
    });
    const waiting = await db.select().from(accessRequests)
        .where(and(eq(accessRequests.userId, first.user.id), eq(accessRequests.status, 'pending')));
    assert.equal(waiting.length, 1);
});

test('an access link for a player with a team carries that team on the pending request', async () => {
    const result = await registerWithAccessLink({
        ...identity(),
        phone,
        link: { role: 'player', clubId },
        team: { id: teamId, name: 'U12' },
        children: null,
    });
    assert.equal(result.queuedForTeam, false);
    const requests = await db.select().from(accessRequests).where(eq(accessRequests.userId, result.user.id));
    assert.equal(requests.length, 1);
    assert.equal(requests[0].requestedRole, 'player');
    assert.equal(requests[0].teamId, teamId);
    // No roster row yet — that only happens once an admin approves the request.
    assert.equal((await db.select().from(players).where(eq(players.userId, result.user.id))).length, 0);
});

test('a team access link sends a parent’s children to the team requests, not the admin queue', async () => {
    const result = await registerWithAccessLink({
        ...identity(),
        phone,
        link: { role: 'parent', clubId },
        team: { id: teamId, name: 'U12' },
        children: [ana],
    });
    assert.equal(result.queuedForTeam, true);
    const joins = await db.select().from(familyJoinRequests).where(eq(familyJoinRequests.userId, result.user.id));
    assert.equal(joins.length, 1);
    assert.equal(joins[0].teamId, teamId);
    assert.equal((await db.select().from(accessRequests).where(eq(accessRequests.userId, result.user.id))).length, 0);
});

test('a teamless access link for a parent creates the children and one admin request', async () => {
    const result = await registerWithAccessLink({
        ...identity(),
        phone,
        link: { role: 'parent', clubId },
        team: null,
        children: [{ firstName: 'Mara', lastName: 'Vasile', birthDate: '2015-04-04' }],
    });
    assert.equal(result.queuedForTeam, false);
    const links = await db.select().from(playerGuardians).where(eq(playerGuardians.userId, result.user.id));
    assert.equal(links.length, 1);
    const requests = await db.select().from(accessRequests).where(eq(accessRequests.userId, result.user.id));
    assert.equal(requests.length, 1);
    assert.equal(requests[0].requestedRole, 'parent');
});

test('an access link signup that fails halfway leaves no account behind', async () => {
    const before = await countUsers();
    const playersBefore = (await db.select().from(players)).length;
    await assert.rejects(() => registerWithAccessLink({
        ...identity({ clerkUserId: 'uid_broken_link' }),
        phone,
        link: { role: 'parent', clubId },
        team: null,
        children: [{ firstName: 'Bun', lastName: 'Copil', birthDate: '2015-01-01' }, badChild],
    }));
    assert.equal(await countUsers(), before);
    assert.equal((await db.select().from(players)).length, playersBefore);
});

async function seedChild(firstName: string) {
    const parent = await registerWithClubCode({
        ...identity(),
        phone,
        code: { role: 'parent', clubId },
        team: { id: teamId, name: 'U12' },
        children: [{ firstName, lastName: 'Garda', birthDate: '2012-12-12' }],
    });
    return parent.created[0].id;
}

test('a guardian invite lets the parent in active, linked to the child, and spends the invite', async () => {
    const playerId = await seedChild('Tudor');
    const { token } = await createGuardianInvite({ clubId, playerId, createdBy: adminId });
    const signedUp = await registerWithGuardianInvite({ ...identity(), phone, token, clubId });
    assert.ok(signedUp);
    assert.equal(signedUp.user.status, 'active');
    assert.equal(signedUp.user.role, 'parent');
    assert.equal(signedUp.redeemed.playerId, playerId);
    const links = await db.select().from(playerGuardians).where(and(eq(playerGuardians.playerId, playerId), eq(playerGuardians.userId, signedUp.user.id)));
    assert.equal(links.length, 1);
});

test('losing the race for a guardian invite keeps nothing of the second signup', async () => {
    const playerId = await seedChild('Ilinca');
    const { token } = await createGuardianInvite({ clubId, playerId, createdBy: adminId });
    assert.ok(await registerWithGuardianInvite({ ...identity(), phone, token, clubId }));

    const before = await countUsers();
    const late = identity({ email: 'late.parent@mail.ro' });
    assert.equal(await registerWithGuardianInvite({ ...late, phone, token, clubId }), null);
    assert.equal(await countUsers(), before);
    assert.equal((await db.select().from(users).where(eq(users.email, 'late.parent@mail.ro'))).length, 0);
});

test('losing the race leaves an existing unfinished account exactly as it was', async () => {
    const playerId = await seedChild('Sorin');
    const { token } = await createGuardianInvite({ clubId, playerId, createdBy: adminId });
    assert.ok(await registerWithGuardianInvite({ ...identity(), phone, token, clubId }));

    const waiting = await registerWithAccessLink({
        ...identity(),
        phone,
        link: { role: 'player', clubId },
        team: null,
        children: null,
    });
    const result = await registerWithGuardianInvite({
        ...identity({ existingUserId: waiting.user.id, clerkUserId: waiting.user.clerkUserId ?? 'uid_wait' }),
        phone,
        token,
        clubId,
    });
    assert.equal(result, null);
    const [after] = await db.select().from(users).where(eq(users.id, waiting.user.id));
    assert.equal(after.role, 'player');
    assert.equal(after.status, 'pending');
});

async function joinRequestsOf(userId: number) {
    return db.select().from(familyJoinRequests).where(eq(familyJoinRequests.userId, userId));
}

test('retrying a team code signup queues only what is not already waiting', async () => {
    const first = await registerWithTeamCode({
        ...identity(),
        signup: { kind: 'parent', phone, children: [ana] },
        team: { id: teamId, clubId },
    });
    assert.equal(first.requests.length, 1);

    const retry = await registerWithTeamCode({
        ...identity({ existingUserId: first.user.id, clerkUserId: first.user.clerkUserId ?? 'uid_retry_team' }),
        signup: { kind: 'parent', phone, children: [{ ...ana, firstName: 'ANA' }] },
        team: { id: teamId, clubId },
    });
    assert.equal(retry.requests.length, 0);
    assert.equal((await joinRequestsOf(first.user.id)).length, 1);

    const extra = await registerWithTeamCode({
        ...identity({ existingUserId: first.user.id, clerkUserId: first.user.clerkUserId ?? 'uid_retry_team' }),
        signup: { kind: 'parent', phone, children: [ana, luca] },
        team: { id: teamId, clubId },
    });
    assert.deepEqual(extra.requests.map((request) => request.childFirstName), ['Luca']);
    assert.equal((await joinRequestsOf(first.user.id)).length, 2);
});

test('a denied request does not block asking again', async () => {
    const first = await registerWithTeamCode({
        ...identity(),
        signup: { kind: 'parent', phone, children: [ana] },
        team: { id: teamId, clubId },
    });
    await db.update(familyJoinRequests).set({ status: 'denied' }).where(eq(familyJoinRequests.userId, first.user.id));
    const again = await registerWithTeamCode({
        ...identity({ existingUserId: first.user.id, clerkUserId: first.user.clerkUserId ?? 'uid_denied_team' }),
        signup: { kind: 'parent', phone, children: [ana] },
        team: { id: teamId, clubId },
    });
    assert.equal(again.requests.length, 1);
    assert.deepEqual((await joinRequestsOf(first.user.id)).map((request) => request.status).sort(), ['denied', 'pending']);

    const waiting = await registerWithAccessLink({ ...identity(), phone, link: { role: 'player', clubId }, team: null, children: null });
    await db.update(accessRequests).set({ status: 'denied' }).where(eq(accessRequests.userId, waiting.user.id));
    assert.equal(await db.transaction((tx) => ensurePendingAccessRequest(tx, waiting.user, clubId, 'player')), true);
});

test('the database itself refuses a second waiting request for the same person and role', async () => {
    const { user } = await registerWithAccessLink({ ...identity(), phone, link: { role: 'player', clubId }, team: null, children: null });
    await assert.rejects(() => db.insert(accessRequests).values({
        userId: user.id, clubId, userName: user.name, userEmail: user.email, requestedRole: 'player',
    }));
    await assert.rejects(() => db.insert(accessRequests).values({
        userId: user.id, clubId, userName: user.name, userEmail: user.email, requestedRole: 'player', status: 'pending',
    }));
    // Another role is a different request.
    await db.insert(accessRequests).values({ userId: user.id, clubId, userName: user.name, userEmail: user.email, requestedRole: 'coach' });
});

test('two parallel openings of the same link create a single admin request', async () => {
    const { user } = await registerWithAccessLink({ ...identity(), phone, link: { role: 'player', clubId }, team: null, children: null });
    await db.delete(accessRequests).where(eq(accessRequests.userId, user.id));
    const results = await Promise.all([
        db.transaction((tx) => ensurePendingAccessRequest(tx, user, clubId, 'player')),
        db.transaction((tx) => ensurePendingAccessRequest(tx, user, clubId, 'player')),
    ]);
    assert.deepEqual(results.sort(), [false, true]);
    assert.equal((await db.select().from(accessRequests).where(eq(accessRequests.userId, user.id))).length, 1);
});

test('a second parent whose signup is retried stays waiting for the club', async () => {
    await seedChild('Vlad');
    const signup = {
        ...identity(),
        phone,
        code: { role: 'parent', clubId },
        team: { id: teamId, name: 'U12' },
        children: [{ firstName: 'Vlad', lastName: 'Garda', birthDate: '2012-12-12' }],
    };
    const first = await registerWithClubCode(signup);
    assert.equal(first.status, 'pending');
    assert.equal(first.requested.length, 1);

    const retry = await registerWithClubCode({ ...signup, existingUserId: first.user.id });
    assert.equal(retry.status, 'pending');
    assert.equal(retry.requested.length, 0);
    assert.equal((await db.select().from(users).where(eq(users.id, first.user.id)))[0].status, 'pending');
    assert.equal((await joinRequestsOf(first.user.id)).length, 1);
});

test('approving a player access request with a team creates the roster row', async () => {
    const { user } = await registerWithAccessLink({
        ...identity(),
        phone,
        link: { role: 'player', clubId },
        team: { id: teamId, name: 'U12' },
        children: null,
    });

    await placeApprovedPlayerOnTeam({ userId: user.id, userName: user.name, userEmail: user.email, teamId });

    const [player] = await db.select().from(players).where(eq(players.userId, user.id));
    assert.ok(player);
    assert.equal(player.teamId, teamId);
    assert.equal(player.email, user.email);
    const memberships = await db.select().from(playersToTeams).where(and(eq(playersToTeams.playerId, player.id), eq(playersToTeams.teamId, teamId)));
    assert.equal(memberships.length, 1);
});

test('approving a player request claims an admin-pre-created unclaimed row by email instead of duplicating it', async () => {
    const [preCreated] = await db.insert(players).values({
        name: 'Pre Created', firstName: 'Pre', lastName: 'Created', status: 'active', email: 'preclaimed@mail.ro',
    }).returning();
    const { user } = await registerWithAccessLink({
        ...identity({ email: 'preclaimed@mail.ro' }),
        phone,
        link: { role: 'player', clubId },
        team: { id: teamId, name: 'U12' },
        children: null,
    });

    await placeApprovedPlayerOnTeam({ userId: user.id, userName: user.name, userEmail: user.email, teamId });

    const rows = await db.select().from(players).where(eq(players.email, 'preclaimed@mail.ro'));
    assert.equal(rows.length, 1, 'claims the existing row instead of inserting a second one');
    assert.equal(rows[0].id, preCreated.id);
    assert.equal(rows[0].userId, user.id);
    assert.equal(rows[0].teamId, teamId);
});

test('approving a second request for a player already on the team does not duplicate the membership', async () => {
    const { user } = await registerWithAccessLink({
        ...identity(),
        phone,
        link: { role: 'player', clubId },
        team: { id: teamId, name: 'U12' },
        children: null,
    });
    await placeApprovedPlayerOnTeam({ userId: user.id, userName: user.name, userEmail: user.email, teamId });
    await placeApprovedPlayerOnTeam({ userId: user.id, userName: user.name, userEmail: user.email, teamId });

    const [player] = await db.select().from(players).where(eq(players.userId, user.id));
    const memberships = await db.select().from(playersToTeams).where(and(eq(playersToTeams.playerId, player.id), eq(playersToTeams.teamId, teamId)));
    assert.equal(memberships.length, 1);
});
