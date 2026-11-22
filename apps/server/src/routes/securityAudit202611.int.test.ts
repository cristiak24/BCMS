import '../test/pgliteEnv';
import { bearer } from '../test/fakeClerk';
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { and, eq } from 'drizzle-orm';
import { db } from '../db';
import {
    clubs, events, familyJoinRequests, l12Lineups, playerGuardians, playerPayments, players, playersToTeams, storedFiles, teams, users,
} from '../db/schema';
import { closeDb, createSchema } from '../test/pgliteDb';
import { serve } from '../test/serve';
import authRoutes from './auth';
import playerRoutes from './playerRoutes';
import contactsRouter from './contacts';
import teamsRouter from './teams';
import clubDocumentsRouter from './clubDocuments';
import profileRoutes from './profile';
import invitationsRoutes from './invitations';
import manageAccessRoutes from './manageAccess';
import familyRequestRoutes from './familyRequests';
import l12Routes from './l12';
import financeRoutes from './finance';

/**
 * AUDIT-SECURITY-2026-11 (Valul 1): one test per P0/P1 fix.
 *
 *  P0-1  an account waiting for approval (or denied) is not yet a member
 *  P1-1  an avatar change deletes only the caller's own old avatar
 *  P1-2  a coach links a join request only to a child of a team they coach
 *  P1-3  coach writes (contacts, L12 reset) use the write rule
 *  P1-4  another club's player never enters this club through an email match
 */

const tok = (uid: string, email: string) => bearer(uid, email);
const ADMIN_A = tok('user_adm_a', 'adm@a.ro');
const ADMIN_B = tok('user_adm_b', 'adm@b.ro');
const COACH = tok('user_coach', 'coach@a.ro');
const COACH2 = tok('user_coach2', 'coach2@a.ro');
const PENDING_COACH = tok('user_pending', 'pending@a.ro');
const PENDING_ADMIN = tok('user_pending_adm', 'pending-adm@a.ro');
const MEMBER = tok('user_member', 'member@a.ro');
const OTHER = tok('user_other', 'other@b.ro');

let api: Awaited<ReturnType<typeof serve>>;
let clubA = 0;
let clubB = 0;
let teamCoach = 0;      // club A, coached by COACH
let teamCoach2 = 0;     // club A, coached by COACH2
let teamNoCoach = 0;    // club A, no coach (admin-only for writes)
let teamB = 0;          // club B
let coachId = 0;
let sockParentId = 0;
let memberId = 0;
let otherId = 0;
let anaNoCoach = 0;     // on the coach-less team, with a parent's phone
let ioanaCoach2 = 0;    // on COACH2's team
let bogdanB = 0;        // club B player whose email is a club-A account
let tudorTeamless = 0;  // no team, email of a club-A account: club A's
let matchNoCoach = 0;

const call = (auth: string, method: string, path: string, body?: unknown) => api.call(method, `/api${path}`, { auth, body });

async function team(name: string, code: string, clubId: number, coach: number | null) {
    const [row] = await db.insert(teams).values({
        frbTeamId: '', name, frbLeagueId: '', leagueName: 'Liga', frbSeasonId: '', seasonName: '2026', inviteCode: code, clubId, coachId: coach,
    } as typeof teams.$inferInsert).returning();
    return row.id;
}

async function player(firstName: string, teamId: number | null, extra: Partial<typeof players.$inferInsert> = {}) {
    const [row] = await db.insert(players).values({ firstName, lastName: 'Test', teamId, status: 'active', ...extra } as typeof players.$inferInsert).returning();
    if (teamId != null) await db.insert(playersToTeams).values({ playerId: row.id, teamId });
    return row.id;
}

before(async () => {
    await createSchema();
    [{ id: clubA }] = await db.insert(clubs).values({ name: 'Club A', normalizedName: 'club a' }).returning();
    [{ id: clubB }] = await db.insert(clubs).values({ name: 'Club B', normalizedName: 'club b' }).returning();
    const user = async (values: Partial<typeof users.$inferInsert>) => (await db.insert(users).values(values as typeof users.$inferInsert).returning())[0].id;
    await user({ email: 'adm@a.ro', name: 'Admin A', role: 'admin', status: 'active', clubId: clubA, clerkUserId: 'user_adm_a' });
    await user({ email: 'adm@b.ro', name: 'Admin B', role: 'admin', status: 'active', clubId: clubB, clerkUserId: 'user_adm_b' });
    coachId = await user({ email: 'coach@a.ro', name: 'Antrenor', role: 'coach', status: 'active', clubId: clubA, clerkUserId: 'user_coach' });
    const coach2Id = await user({ email: 'coach2@a.ro', name: 'Antrenor 2', role: 'coach', status: 'active', clubId: clubA, clerkUserId: 'user_coach2' });
    await user({ email: 'pending@a.ro', name: 'Neaprobat', role: 'coach', status: 'pending', clubId: clubA, clerkUserId: 'user_pending' });
    await user({ email: 'pending-adm@a.ro', name: 'Admin neaprobat', role: 'admin', status: 'pending', clubId: clubA, clerkUserId: 'user_pending_adm' });
    memberId = await user({ email: 'member@a.ro', name: 'Membru A', role: 'parent', status: 'active', clubId: clubA, clerkUserId: 'user_member', phone: '+40700000555' });
    otherId = await user({ email: 'other@b.ro', name: 'Membru B', role: 'parent', status: 'active', clubId: clubB, clerkUserId: 'user_other' });
    // The coach's second account, waiting on a team-code request.
    sockParentId = await user({ email: 'sock@a.ro', name: 'Cont secundar', role: 'parent', status: 'pending', clubId: clubA, clerkUserId: 'user_sock' });

    teamCoach = await team('U12', 'AAA111', clubA, coachId);
    teamCoach2 = await team('U14', 'BBB222', clubA, coach2Id);
    teamNoCoach = await team('U16', 'CCC333', clubA, null);
    teamB = await team('B U14', 'DDD444', clubB, null);

    anaNoCoach = await player('Ana', teamNoCoach, { guardianName: 'Mama Anei', guardianPhone: '+40700111222' });
    ioanaCoach2 = await player('Ioana', teamCoach2, { guardianPhone: '+40700333444' });
    // Club B's player, recorded with the email of a club-A account (a parent
    // whose other child plays in club A).
    bogdanB = await player('Bogdan', teamB, { email: 'member@a.ro', guardianPhone: '+40700999888', medicalCheckExpiry: '2027-01-01' });
    tudorTeamless = await player('Tudor', null, { email: 'member@a.ro' });
    await db.insert(playerPayments).values({ playerId: bogdanB, amount: 150, status: 'paid', month: 10, year: 2026, date: '2026-10-05', description: 'Plată club B' } as typeof playerPayments.$inferInsert);

    [{ id: matchNoCoach }] = await db.insert(events).values({
        type: 'match', title: 'Meci U16', startTime: '2026-11-20 10:00:00', endTime: '2026-11-20 11:30:00', teamId: teamNoCoach, clubId: clubA,
    } as typeof events.$inferInsert).returning();
    await db.insert(l12Lineups).values({ teamId: teamNoCoach, eventId: matchNoCoach } as typeof l12Lineups.$inferInsert);

    api = await serve({
        '/api/auth': authRoutes, '/api/players': playerRoutes, '/api/contacts': contactsRouter, '/api/teams': teamsRouter,
        '/api/club-documents': clubDocumentsRouter, '/api/profile': profileRoutes, '/api/invitations': invitationsRoutes,
        '/api/manage-access': manageAccessRoutes, '/api/family-requests': familyRequestRoutes, '/api/l12': l12Routes,
        '/api/finance': financeRoutes,
    });
});

after(async () => {
    await api.close();
    await closeDb();
});

// ── P0-1 ──────────────────────────────────────────────────────────────────

test('P0-1: an unapproved coach reads no player, contact, team or document of the club', async () => {
    for (const path of ['/players/roster', '/players/browse', `/players/${anaNoCoach}`, '/contacts', '/teams', '/club-documents', `/l12/events/${matchNoCoach}`, '/family-requests']) {
        const res = await call(PENDING_COACH, 'GET', path);
        assert.equal(res.status, 403, `${path}: ${JSON.stringify(res.body)}`);
        assert.equal(res.body.code, 'ACCOUNT_PENDING', path);
        assert.ok(!JSON.stringify(res.body).includes('+40700111222'), path);
    }
    const write = await call(PENDING_COACH, 'PUT', `/contacts/players/${anaNoCoach}`, { guardianPhone: '+40799999999' });
    assert.equal(write.status, 403);
    const [ana] = await db.select().from(players).where(eq(players.id, anaNoCoach));
    assert.equal(ana.guardianPhone, '+40700111222');
});

test('P0-1: the routes requireRequestUser guards refuse a pending admin too', async () => {
    const res = await call(PENDING_ADMIN, 'GET', '/manage-access/requests');
    assert.equal(res.status, 403, JSON.stringify(res.body));
    assert.equal(res.body.code, 'ACCOUNT_PENDING');
});

test('P0-1: a pending account still reaches its own session, requests and profile', async () => {
    assert.equal((await call(PENDING_COACH, 'GET', '/auth/me')).status, 200);
    assert.equal((await call(PENDING_COACH, 'GET', '/auth/my-requests')).status, 200);
    const profile = await call(PENDING_COACH, 'GET', '/profile/me');
    assert.equal(profile.status, 200, JSON.stringify(profile.body));
});

test('P0-1: once approved (active) the same coach is let in', async () => {
    await db.update(users).set({ status: 'active' }).where(eq(users.clerkUserId, 'user_pending'));
    try {
        assert.equal((await call(PENDING_COACH, 'GET', '/players/roster')).status, 200);
    } finally {
        await db.update(users).set({ status: 'pending' }).where(eq(users.clerkUserId, 'user_pending'));
    }
});

// ── P1-1 ──────────────────────────────────────────────────────────────────

const PNG = Buffer.from('89504e470d0a1a0a0000000d4948445200000001000000010806000000', 'hex');

async function uploadAvatar(auth: string) {
    const form = new FormData();
    form.append('image', new Blob([PNG], { type: 'image/png' }), 'a.png');
    return fetch(`${api.base}/api/profile/me/avatar`, { method: 'POST', headers: { authorization: auth }, body: form });
}

test('P1-1: pointing one\'s avatar at another person\'s file and uploading a new one deletes nothing of theirs', async () => {
    const victimKey = 'a'.repeat(32);
    await db.insert(storedFiles).values({
        key: victimKey, clubId: clubB, uploadedBy: otherId, kind: 'finance_doc', isPublic: false,
        fileName: 'chitanta.pdf', mimeType: 'application/pdf', sizeBytes: 5, data: Buffer.from('%PDF-'),
    } as typeof storedFiles.$inferInsert);

    // The registration endpoint no longer takes an avatar URL…
    const reg = await call(MEMBER, 'POST', '/invitations/registration/complete', {
        firstName: 'Membru', lastName: 'A', avatarUrl: `https://api.bcms.ro/api/files/${victimKey}`,
    });
    assert.equal(reg.status, 200, JSON.stringify(reg.body));
    const [afterReg] = await db.select().from(users).where(eq(users.id, memberId));
    assert.ok(!String(afterReg.avatarUrl ?? '').includes(victimKey));

    // …and even a stale avatar_url pointing at someone else's key is not deleted on upload.
    await db.update(users).set({ avatarUrl: `https://api.bcms.ro/api/files/${victimKey}` }).where(eq(users.id, memberId));
    const first = await uploadAvatar(MEMBER);
    assert.equal(first.status, 200, await first.clone().text());
    assert.equal((await db.select().from(storedFiles).where(eq(storedFiles.key, victimKey))).length, 1, 'victim file survives');

    // The caller's own previous avatar is still cleaned up.
    const firstKey = (await first.json() as { avatarUrl: string }).avatarUrl.split('/api/files/')[1];
    const second = await uploadAvatar(MEMBER);
    assert.equal(second.status, 200);
    assert.equal((await db.select().from(storedFiles).where(eq(storedFiles.key, firstKey))).length, 0, 'own old avatar deleted');
});

// ── P1-2 ──────────────────────────────────────────────────────────────────

test('P1-2: a coach cannot approve a request onto a child of another coach\'s team', async () => {
    const [request] = await db.insert(familyJoinRequests).values({
        clubId: clubA, teamId: teamCoach, userId: sockParentId, kind: 'parent', childFirstName: 'Ioana', childLastName: 'Test',
    } as typeof familyJoinRequests.$inferInsert).returning();

    const res = await call(COACH, 'POST', `/family-requests/${request.id}/approve`, { playerId: ioanaCoach2 });
    assert.equal(res.status, 403, JSON.stringify(res.body));
    assert.equal((await db.select().from(playerGuardians).where(eq(playerGuardians.playerId, ioanaCoach2))).length, 0, 'no guardian link');
    assert.equal((await db.select().from(playersToTeams).where(and(eq(playersToTeams.playerId, ioanaCoach2), eq(playersToTeams.teamId, teamCoach)))).length, 0, 'not pulled onto the coach\'s team');
    const [row] = await db.select().from(familyJoinRequests).where(eq(familyJoinRequests.id, request.id));
    assert.equal(row.status, 'pending');

    // The admin may still link it to that child.
    const admin = await call(ADMIN_A, 'POST', `/family-requests/${request.id}/approve`, { playerId: ioanaCoach2 });
    assert.equal(admin.status, 200, JSON.stringify(admin.body));
});

// ── P1-3 ──────────────────────────────────────────────────────────────────

test('P1-3: a coach edits no contact and resets no L12 of a team with no coach', async () => {
    const write = await call(COACH, 'PUT', `/contacts/players/${anaNoCoach}`, { guardianPhone: '+40799999999' });
    assert.equal(write.status, 404, JSON.stringify(write.body));
    const [ana] = await db.select().from(players).where(eq(players.id, anaNoCoach));
    assert.equal(ana.guardianPhone, '+40700111222');

    const reset = await call(COACH, 'DELETE', `/l12/events/${matchNoCoach}`);
    assert.equal(reset.status, 403, JSON.stringify(reset.body));
    assert.equal((await db.select().from(l12Lineups).where(eq(l12Lineups.eventId, matchNoCoach))).length, 1);

    // Reading stays allowed (coach-less teams are readable), and the admin may reset.
    assert.equal((await call(COACH, 'GET', `/l12/events/${matchNoCoach}`)).status, 200);
    assert.equal((await call(ADMIN_A, 'DELETE', `/l12/events/${matchNoCoach}`)).status, 204);
});

// ── P1-4 ──────────────────────────────────────────────────────────────────

test('P1-4: club B\'s player with a club-A account\'s email stays out of club A', async () => {
    const roster = await call(ADMIN_A, 'GET', '/players/roster');
    assert.equal(roster.status, 200);
    const ids = (roster.body as { id: number }[]).map((row) => row.id);
    assert.ok(!ids.includes(bogdanB), 'not on club A\'s roster');
    assert.ok(ids.includes(tudorTeamless), 'a player on no team still joins through the account');

    const browse = await call(ADMIN_A, 'GET', '/players/browse?limit=50');
    assert.ok(!(browse.body.items as { id: number }[]).some((row) => row.id === bogdanB));

    const record = await call(ADMIN_A, 'GET', `/players/${bogdanB}`);
    assert.notEqual(record.status, 200, JSON.stringify(record.body).slice(0, 200));
    const edit = await call(ADMIN_A, 'PUT', `/players/${bogdanB}`, { firstName: 'Furat' });
    assert.notEqual(edit.status, 200);
    const [bogdan] = await db.select().from(players).where(eq(players.id, bogdanB));
    assert.equal(bogdan.firstName, 'Bogdan');

    const balances = await call(ADMIN_A, 'GET', '/finance/admin/balances');
    assert.equal(balances.status, 200, JSON.stringify(balances.body).slice(0, 200));
    assert.ok(!JSON.stringify(balances.body).includes('Bogdan'), 'not in club A\'s balances');
    const recent = await call(ADMIN_A, 'GET', '/finance/admin/recent-payments');
    assert.ok(!JSON.stringify(recent.body).includes('Plată club B'), 'club B\'s payment not in club A\'s list');

    // Club B still sees its own player.
    const rosterB = await call(ADMIN_B, 'GET', '/players/roster');
    assert.ok((rosterB.body as { id: number }[]).some((row) => row.id === bogdanB));
});

test('P1-4: contacts show no phone of another club\'s account', async () => {
    // A club-A player recorded with club B's member's email.
    const planted = await player('Planta', teamCoach, { email: 'other@b.ro' });
    await db.update(users).set({ phone: '+40711000111' }).where(eq(users.id, otherId));
    const res = await call(ADMIN_A, 'GET', '/contacts');
    assert.equal(res.status, 200);
    const row = (res.body.players as { id: number; accountPhone: string | null }[]).find((p) => p.id === planted);
    assert.ok(row, 'the club-A player is listed');
    assert.equal(row.accountPhone, null);
    assert.ok(!JSON.stringify(res.body).includes('+40711000111'));
    void OTHER; void COACH2;
});
