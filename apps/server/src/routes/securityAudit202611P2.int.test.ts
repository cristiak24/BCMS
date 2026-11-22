import '../test/pgliteEnv';
import { bearer } from '../test/fakeClerk';
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { and, eq } from 'drizzle-orm';
import { db } from '../db';
import { accessRequests, clubs, guardianInvites, playerGuardians, players, playersToTeams, teams, users } from '../db/schema';
import { closeDb, createSchema } from '../test/pgliteDb';
import { serve } from '../test/serve';
import authRoutes from './auth';
import playerRoutes from './playerRoutes';
import familyRoutes from './family';
import manageAccessRoutes from './manageAccess';
import { createGuardianInvite } from '../lib/guardianInvites';
import { recipientsForPlayers } from '../lib/notifications';
import { clientIp, rateLimit } from '../middleware/rateLimit';

/**
 * AUDIT-SECURITY-2026-11 (Valul 1): one test per P2 fix.
 *
 *  P2-1  a coach's „scoate din lot” removes the player from their own teams only
 *  P2-2  a fam_ link from another club is neither consumed nor linked
 *  P2-3  a stale access request cannot move an active account into this club
 *  P2-4  a signup identity without an email is refused
 *  P2-5  the rate limit keys on CF-Connecting-IP (Cloudflare rejects a client-set one)
 *  P2-6  a teamless player's club comes from an account in the caller's club only
 *  P2-7  notifications by email reach only accounts of the player's own club
 */

const tok = (uid: string, email: string | null) => bearer(uid, email);
const ADMIN_A = tok('user_adm_a', 'adm@a.ro');
const ADMIN_B = tok('user_adm_b', 'adm@b.ro');
const COACH = tok('user_coach', 'coach@a.ro');
const PARENT_B = tok('user_parent_b', 'parent@b.ro');
const NO_EMAIL = tok('user_no_email', null);

let api: Awaited<ReturnType<typeof serve>>;
let clubA = 0;
let clubB = 0;
let adminAId = 0;
let adminBId = 0;
let parentBId = 0;
let memberAId = 0;
let memberBId = 0;
let teamCoach = 0;   // club A, coached by COACH
let teamOther = 0;   // club A, another coach
let teamB = 0;       // club B
let mihaiTwoTeams = 0;   // on both of club A's teams
let elenaA = 0;          // club A, for the fam_ link
let tudorTeamless = 0;   // no team, email of a club-A account
let radu = 0;            // club A team, email of a club-B account
let sorin = 0;           // club A team, email of a club-A account

const call = (auth: string, method: string, path: string, body?: unknown) => api.call(method, `/api${path}`, { auth, body });

async function team(name: string, code: string, clubId: number, coach: number | null) {
    const [row] = await db.insert(teams).values({
        frbTeamId: '', name, frbLeagueId: '', leagueName: 'Liga', frbSeasonId: '', seasonName: '2026', inviteCode: code, clubId, coachId: coach,
    } as typeof teams.$inferInsert).returning();
    return row.id;
}

async function player(firstName: string, teamIds: number[], extra: Partial<typeof players.$inferInsert> = {}) {
    const [row] = await db.insert(players).values({ firstName, lastName: 'Test', teamId: teamIds[0] ?? null, status: 'active', ...extra } as typeof players.$inferInsert).returning();
    for (const teamId of teamIds) await db.insert(playersToTeams).values({ playerId: row.id, teamId });
    return row.id;
}

before(async () => {
    await createSchema();
    [{ id: clubA }] = await db.insert(clubs).values({ name: 'Club A', normalizedName: 'club a' }).returning();
    [{ id: clubB }] = await db.insert(clubs).values({ name: 'Club B', normalizedName: 'club b' }).returning();
    const user = async (values: Partial<typeof users.$inferInsert>) => (await db.insert(users).values(values as typeof users.$inferInsert).returning())[0].id;
    adminAId = await user({ email: 'adm@a.ro', name: 'Admin A', role: 'admin', status: 'active', clubId: clubA, clerkUserId: 'user_adm_a' });
    adminBId = await user({ email: 'adm@b.ro', name: 'Admin B', role: 'admin', status: 'active', clubId: clubB, clerkUserId: 'user_adm_b' });
    const coachId = await user({ email: 'coach@a.ro', name: 'Antrenor', role: 'coach', status: 'active', clubId: clubA, clerkUserId: 'user_coach' });
    const otherCoachId = await user({ email: 'coach2@a.ro', name: 'Antrenor 2', role: 'coach', status: 'active', clubId: clubA, clerkUserId: 'user_coach2' });
    parentBId = await user({ email: 'parent@b.ro', name: 'Părinte B', role: 'parent', status: 'active', clubId: clubB, clerkUserId: 'user_parent_b' });
    memberAId = await user({ email: 'member@a.ro', name: 'Membru A', role: 'parent', status: 'active', clubId: clubA, clerkUserId: 'user_member_a' });
    memberBId = await user({ email: 'member@b.ro', name: 'Membru B', role: 'parent', status: 'active', clubId: clubB, clerkUserId: 'user_member_b' });

    teamCoach = await team('U12', 'AAA111', clubA, coachId);
    teamOther = await team('U14', 'BBB222', clubA, otherCoachId);
    teamB = await team('B U14', 'DDD444', clubB, null);

    mihaiTwoTeams = await player('Mihai', [teamCoach, teamOther]);
    elenaA = await player('Elena', [teamCoach]);
    tudorTeamless = await player('Tudor', [], { email: 'member@a.ro' });
    radu = await player('Radu', [teamCoach], { email: 'member@b.ro' });
    sorin = await player('Sorin', [teamCoach], { email: 'member@a.ro' });

    api = await serve({
        '/api/auth': authRoutes, '/api/players': playerRoutes, '/api/family': familyRoutes, '/api/manage-access': manageAccessRoutes,
    });
});

after(async () => {
    await api.close();
    await closeDb();
});

async function teamIdsOf(playerId: number) {
    const rows = await db.select({ teamId: playersToTeams.teamId }).from(playersToTeams).where(eq(playersToTeams.playerId, playerId));
    return rows.map((row) => row.teamId).sort((a, b) => a - b);
}

test('P2-1: a coach removes the player from their own team only; the other squad keeps them', async () => {
    const res = await call(COACH, 'DELETE', `/players/${mihaiTwoTeams}/roster`);
    assert.equal(res.status, 200);
    assert.deepEqual(await teamIdsOf(mihaiTwoTeams), [teamOther]);
    const [row] = await db.select().from(players).where(eq(players.id, mihaiTwoTeams));
    assert.equal(row.status, 'active');
    assert.equal(row.teamId, teamOther, 'the legacy team column moves to a team the player is still on');

    // The admin removes the player from the club: no team left, inactive.
    assert.equal((await call(ADMIN_A, 'DELETE', `/players/${mihaiTwoTeams}/roster`)).status, 200);
    assert.deepEqual(await teamIdsOf(mihaiTwoTeams), []);
    const [after] = await db.select().from(players).where(eq(players.id, mihaiTwoTeams));
    assert.equal(after.status, 'inactive');
    assert.equal(after.teamId, null);
});

test('P2-2: a club-A fam_ link redeemed by a club-B parent is not consumed and links nothing', async () => {
    const { token } = await createGuardianInvite({ clubId: clubA, playerId: elenaA, createdBy: adminAId });
    const res = await call(PARENT_B, 'POST', '/family/invites/accept', { token });
    assert.equal(res.status, 400);
    const links = await db.select().from(playerGuardians).where(and(eq(playerGuardians.playerId, elenaA), eq(playerGuardians.userId, parentBId)));
    assert.equal(links.length, 0, 'no guardian link to another club’s child');
    const [invite] = await db.select().from(guardianInvites).where(eq(guardianInvites.playerId, elenaA));
    assert.equal(invite.usedAt, null, 'the invite stays usable for the right family');
});

test('P2-3: approving a stale request does not move an active club-B admin into club A', async () => {
    const [request] = await db.insert(accessRequests).values({
        userId: adminBId, clubId: clubA, userName: 'Admin B', userEmail: 'adm@b.ro', requestedRole: 'coach',
    } as typeof accessRequests.$inferInsert).returning();
    const res = await call(ADMIN_A, 'POST', `/manage-access/requests/${request.id}/approve`);
    assert.equal(res.status, 400);
    const [adminB] = await db.select().from(users).where(eq(users.id, adminBId));
    assert.equal(adminB.clubId, clubB);
    assert.equal(adminB.role, 'admin');
    const [closed] = await db.select().from(accessRequests).where(eq(accessRequests.id, request.id));
    assert.equal(closed.status, 'denied', 'the stale request is closed');
});

test('P2-4: a signup identity without an email is refused before anything is matched', async () => {
    const res = await call(NO_EMAIL, 'POST', '/auth/complete-invite-signup', { name: 'Fără Email', inviteToken: 'AAA111' });
    assert.equal(res.status, 400);
    assert.match(String((res.body as { error?: string }).error), /adresă de email/);
    const rows = await db.select().from(users).where(eq(users.clerkUserId, 'user_no_email'));
    assert.equal(rows.length, 0);
});

test('P2-5: the limiter keys on a valid CF-Connecting-IP, and on req.ip otherwise', async () => {
    assert.equal(clientIp({ headers: { 'cf-connecting-ip': '198.51.100.7' }, ip: '10.0.0.1' }), '198.51.100.7');
    assert.equal(clientIp({ headers: { 'cf-connecting-ip': '1.2.3.4, 5.6.7.8' }, ip: '10.0.0.1' }), '10.0.0.1');
    assert.equal(clientIp({ headers: { 'cf-connecting-ip': 'not-an-ip' }, ip: '10.0.0.1' }), '10.0.0.1');
    assert.equal(clientIp({ headers: {}, ip: '10.0.0.1' }), '10.0.0.1');

    const limiter = rateLimit({ bucket: 'test:p2-5', limit: 2, windowMs: 60_000, key: (req) => `ip:${clientIp(req)}` });
    const hit = (ip: string) => new Promise<number>((resolve) => {
        const req = { headers: { 'cf-connecting-ip': ip }, ip: '10.0.0.1' } as never;
        const res = { status: (code: number) => ({ json: () => resolve(code) }), setHeader: () => undefined, set: () => undefined } as never;
        limiter(req, res, () => resolve(200));
    });
    assert.deepEqual([await hit('198.51.100.8'), await hit('198.51.100.8'), await hit('198.51.100.8')], [200, 200, 429]);
    assert.equal(await hit('198.51.100.9'), 200, 'another visitor has their own bucket');
});

test('P2-6: a teamless player belongs to the club of a matching account in the caller’s club, never another', async () => {
    const mine = await call(ADMIN_A, 'GET', `/players/${tudorTeamless}`);
    assert.equal(mine.status, 200);
    assert.equal((mine.body as { clubId: number | null }).clubId, clubA);
    const theirs = await call(ADMIN_B, 'GET', `/players/${tudorTeamless}`);
    assert.equal(theirs.status, 403);
});

test('P2-7: an email match notifies only an account of the player’s own club', async () => {
    const recipients = await recipientsForPlayers([radu, sorin, tudorTeamless]);
    assert.deepEqual([...(recipients.get(radu) ?? [])], [], 'a club-B account on a club-A player hears nothing');
    assert.deepEqual([...(recipients.get(sorin) ?? [])], [memberAId]);
    assert.deepEqual([...(recipients.get(tudorTeamless) ?? [])], [memberAId], 'a player on no team keeps the email match');
    assert.notEqual(memberBId, memberAId);
});
