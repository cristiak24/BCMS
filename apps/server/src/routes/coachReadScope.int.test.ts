import '../test/pgliteEnv';
import { bearer } from '../test/fakeClerk';
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { db } from '../db';
import { attendance, clubs, events, playerGuardians, players, playersToTeams, teams, users } from '../db/schema';
import { closeDb, createSchema } from '../test/pgliteDb';
import { serve } from '../test/serve';
import playerRoutes from './playerRoutes';
import teamsRouter from './teams';
import contactsRouter from './contacts';
import eventRoutes from './eventRoutes';

/**
 * P1-5 from the 2026-10-15 audit, decided 2026-10-16: a coach sees the
 * personal data of their own squads' players (and of players on no team
 * yet), not another coach's. The U12 coach used to read the U14 parent's
 * phone (+40700111222) through /contacts, /players/:id, /teams/:id/players
 * and the attendance sheet.
 */

const U14_PARENT_PHONE = '+40700111222';
const coach12 = bearer('user_c12', 'c12@club.ro');
const admin = bearer('user_adm', 'adm@club.ro');

let api: Awaited<ReturnType<typeof serve>>;
let u12 = 0;
let u14 = 0;
let luca = 0;
let ana = 0;
let radu = 0;
let u14Training = 0;
let u12Training = 0;

async function team(name: string, code: string, clubId: number, coachId: number) {
    const [row] = await db.insert(teams).values({
        frbTeamId: '', name, frbLeagueId: '', leagueName: 'Liga', frbSeasonId: '', seasonName: '2026', inviteCode: code, clubId, coachId,
    }).returning();
    return row.id;
}

async function player(clubId: number, firstName: string, teamId: number | null, guardianPhone: string) {
    const [row] = await db.insert(players).values({ clubId, firstName, lastName: 'Test', teamId, guardianName: 'Părinte', guardianPhone } as typeof players.$inferInsert).returning();
    if (teamId != null) await db.insert(playersToTeams).values({ playerId: row.id, teamId });
    return row.id;
}

async function training(teamId: number, clubId: number) {
    const [row] = await db.insert(events).values({
        type: 'training', title: 'Antrenament', startTime: '2026-10-10 15:00:00', endTime: '2026-10-10 16:30:00', teamId, clubId,
    } as typeof events.$inferInsert).returning();
    return row.id;
}

before(async () => {
    await createSchema();
    const [club] = await db.insert(clubs).values({ name: 'Club', normalizedName: 'club' }).returning();
    await db.insert(users).values({ email: 'adm@club.ro', name: 'Admin', role: 'admin', status: 'active', clubId: club.id, clerkUserId: 'user_adm' });
    const [c12] = await db.insert(users).values({ email: 'c12@club.ro', name: 'Antrenor U12', role: 'coach', status: 'active', clubId: club.id, clerkUserId: 'user_c12' }).returning();
    const [c14] = await db.insert(users).values({ email: 'c14@club.ro', name: 'Antrenor U14', role: 'coach', status: 'active', clubId: club.id, clerkUserId: 'user_c14' }).returning();
    u12 = await team('U12', 'AAA111', club.id, c12.id);
    u14 = await team('U14', 'BBB222', club.id, c14.id);
    luca = await player(club.id, 'Luca', u12, '+40700000012');
    ana = await player(club.id, 'Ana', u14, U14_PARENT_PHONE);
    // On no team yet, in the club through their parent's account.
    radu = await player(club.id, 'Radu', null, '+40700000099');
    const [parent] = await db.insert(users).values({ email: 'p@club.ro', name: 'Părinte Radu', role: 'parent', status: 'active', clubId: club.id }).returning();
    await db.insert(playerGuardians).values({ playerId: radu, userId: parent.id });

    u14Training = await training(u14, club.id);
    u12Training = await training(u12, club.id);
    await db.insert(attendance).values([
        { playerId: ana, teamId: u14, eventId: u14Training, status: 'absent', note: 'Notă privată U14', date: '2026-10-10 15:00:00' },
        { playerId: luca, teamId: u12, eventId: u12Training, status: 'present', date: '2026-10-10 15:00:00' },
    ] as typeof attendance.$inferInsert[]);

    api = await serve({ '/api/players': playerRoutes, '/api/teams': teamsRouter, '/api/contacts': contactsRouter, '/api/events': eventRoutes });
});

after(async () => {
    await api.close();
    await closeDb();
});

const ids = (rows: Array<{ id: number }>) => rows.map((row) => row.id).sort((a, b) => a - b);

test('roster and search: the coach\'s squads and unassigned players only', async () => {
    const roster = await api.call('GET', '/api/players/roster', { auth: coach12 });
    assert.equal(roster.status, 200);
    assert.deepEqual(ids(roster.body), [luca, radu].sort((a, b) => a - b));
    assert.doesNotMatch(JSON.stringify(roster.body), new RegExp(U14_PARENT_PHONE.replace('+', '\\+')));

    const search = await api.call('GET', '/api/players/search?query=test', { auth: coach12 });
    assert.deepEqual(ids(search.body), [luca, radu].sort((a, b) => a - b));
    const browse = await api.call('GET', '/api/players/browse', { auth: coach12 });
    assert.deepEqual(ids(browse.body.items), [luca, radu].sort((a, b) => a - b));

    // The admin still sees the whole club.
    const all = await api.call('GET', '/api/players/roster', { auth: admin });
    assert.deepEqual(ids(all.body), [luca, ana, radu].sort((a, b) => a - b));
});

test('another squad\'s player record, team list and stats are refused', async () => {
    assert.equal((await api.call('GET', `/api/players/${ana}`, { auth: coach12 })).status, 403);
    assert.equal((await api.call('GET', `/api/players/${ana}/history`, { auth: coach12 })).status, 403);
    assert.equal((await api.call('GET', `/api/teams/${u14}/players`, { auth: coach12 })).status, 403);
    assert.equal((await api.call('GET', `/api/teams/${u14}/stats`, { auth: coach12 })).status, 403);

    assert.equal((await api.call('GET', `/api/players/${luca}`, { auth: coach12 })).status, 200);
    assert.equal((await api.call('GET', `/api/teams/${u12}/players`, { auth: coach12 })).status, 200);
    assert.equal((await api.call('GET', `/api/teams/${u14}/players`, { auth: admin })).status, 200);
});

test('contacts: the U14 parent\'s phone is not in the U12 coach\'s book, nor editable', async () => {
    const book = await api.call('GET', '/api/contacts', { auth: coach12 });
    assert.equal(book.status, 200);
    assert.deepEqual(book.body.teams.map((t: { id: number }) => t.id), [u12]);
    assert.deepEqual(ids(book.body.players), [luca]);
    assert.doesNotMatch(JSON.stringify(book.body), new RegExp(U14_PARENT_PHONE.replace('+', '\\+')));

    const edit = await api.call('PUT', `/api/contacts/players/${ana}`, { auth: coach12, body: { guardianPhone: '+40711111111' } });
    assert.equal(edit.status, 404);

    const adminBook = await api.call('GET', '/api/contacts', { auth: admin });
    assert.match(JSON.stringify(adminBook.body), new RegExp(U14_PARENT_PHONE.replace('+', '\\+')));
});

test('attendance sheets (with the coach\'s notes) of another squad are refused', async () => {
    assert.equal((await api.call('GET', `/api/events/${u14Training}/attendance`, { auth: coach12 })).status, 403);
    assert.equal((await api.call('GET', `/api/events/${u12Training}/attendance`, { auth: coach12 })).status, 200);

    const batch = await api.call('GET', `/api/events/attendance?eventIds=${u12Training},${u14Training}`, { auth: coach12 });
    assert.equal(batch.status, 200);
    assert.deepEqual(Object.keys(batch.body).map(Number), [u12Training]);
    assert.doesNotMatch(JSON.stringify(batch.body), /Notă privată/);

    const adminSheet = await api.call('GET', `/api/events/${u14Training}/attendance`, { auth: admin });
    assert.equal(adminSheet.body[0].note, 'Notă privată U14');
});
