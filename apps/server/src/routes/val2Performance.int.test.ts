import '../test/pgliteEnv';
import { bearer } from '../test/fakeClerk';
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { db } from '../db';
import { clubs, financialSettings, playerPayments, players, playersToTeams, teams, users } from '../db/schema';
import { closeDb, createSchema } from '../test/pgliteDb';
import { serve } from '../test/serve';
import financeRoutes from './finance';
import dashboardRoutes from './dashboard';
import { toIso } from '../lib/dateUtils';
import { dueDateFor } from '../lib/feeSchedule';

/**
 * Val 2 (performance, 2026-11): „Plăți recente” takes the newest rows from
 * the database (ORDER BY + LIMIT) instead of loading the club's whole payment
 * history; the fee calculation reuses due dates and month labels. Answers
 * must not change: the list is checked against the old in-memory sort.
 */

const admin = bearer('user_adm', 'adm@club.ro');
let api: Awaited<ReturnType<typeof serve>>;
let clubId = 0;

before(async () => {
    await createSchema();
    const [club] = await db.insert(clubs).values({ name: 'Club', normalizedName: 'club' }).returning();
    clubId = club.id;
    await db.insert(users).values({ email: 'adm@club.ro', name: 'Admin', role: 'admin', status: 'active', clubId, clerkUserId: 'user_adm' });
    await db.insert(financialSettings).values({ clubId, monthlyPlayerFee: 150, trainingLevy: 20, facilityFee: 0, autoAdjust: 1, paymentDueDay: 25, billingStartMonth: '2026-01' });
    const [team, other] = await db.insert(teams).values(['U12', 'U14'].map((name, index) => ({
        frbTeamId: '', name, frbLeagueId: '', leagueName: 'Liga', frbSeasonId: '', seasonName: '2026', inviteCode: `P${index}0000`, clubId,
    }))).returning();
    const roster = await db.insert(players).values(['Ana', 'Radu', 'Ioana'].map((firstName, index) => ({
        firstName, lastName: 'Pop', name: `${firstName} Pop`, teamId: index === 2 ? other.id : team.id, status: 'active',
    }))).returning();
    await db.insert(playersToTeams).values(roster.map((player) => ({ playerId: player.id, teamId: player.teamId! })));

    // Another club's payment must never show up.
    const [stranger] = await db.insert(players).values({ firstName: 'Străin', lastName: 'X', name: 'Străin X', status: 'active' }).returning();
    await db.insert(playerPayments).values({ playerId: stranger.id, amount: 999, month: 11, year: 2026, status: 'paid', date: '2026-11-20 10:00:00' });

    // Same-day ties, rows without a payment date (creation date counts),
    // voided requests in several spellings, failed and pending rows.
    const rows = [];
    for (let index = 0; index < 40; index += 1) {
        const player = roster[index % roster.length];
        const day = String(1 + (index % 9)).padStart(2, '0');
        rows.push({
            playerId: player.id,
            amount: 10 + index,
            month: 1 + (index % 11),
            year: 2026,
            status: ['paid', 'void', 'failed', ' Void ', 'pending', 'paid', 'VOID', 'paid'][index % 8],
            date: index % 5 === 0 ? null : `2026-${String(1 + (index % 11)).padStart(2, '0')}-${day} 00:00:00`,
            createdAt: `2026-${String(1 + (index % 11)).padStart(2, '0')}-${day} ${String(index % 24).padStart(2, '0')}:00:00`,
            method: 'cash',
        });
    }
    await db.insert(playerPayments).values(rows);

    api = await serve({ '/finance': financeRoutes, '/dashboard': dashboardRoutes });
});

after(async () => {
    await api.close();
    await closeDb();
});

/** The list as the route built it before: every row, filtered and sorted in JS. */
async function oldRecentPaymentIds(teamId: number | null, limit: number) {
    const teamRows = await db.select().from(teams);
    const teamIds = new Set(teamRows.filter((team) => team.clubId === clubId && (teamId == null || team.id === teamId)).map((team) => team.id));
    const playerIds = new Set((await db.select().from(players)).filter((player) => player.teamId != null && teamIds.has(player.teamId)).map((player) => player.id));
    return (await db.select().from(playerPayments))
        .filter((row) => playerIds.has(row.playerId) && String(row.status).trim().toLowerCase() !== 'void')
        .map((row) => ({ id: row.id, date: toIso(row.date) ?? toIso(row.createdAt)! }))
        .sort((a, b) => (new Date(b.date).getTime() - new Date(a.date).getTime()) || (b.id - a.id))
        .slice(0, limit)
        .map((row) => String(row.id));
}

test('Plăți recente: the newest rows in the same order as the old in-memory sort, voided rows left out', async () => {
    for (const limit of [1, 5, 12, 50]) {
        const { status, body } = await api.call('GET', `/finance/admin/recent-payments?limit=${limit}`, { auth: admin });
        assert.equal(status, 200);
        assert.deepEqual(body.map((row: { id: string }) => row.id), await oldRecentPaymentIds(null, limit), `limit ${limit}`);
        assert.ok(body.every((row: { status: string }) => row.status.trim().toLowerCase() !== 'void'));
        assert.ok(body.every((row: { playerName: string }) => row.playerName !== 'Străin X'));
    }
    const [team] = await db.select().from(teams);
    const scoped = (await api.call('GET', `/finance/admin/recent-payments?limit=50&teamId=${team.id}`, { auth: admin })).body;
    assert.deepEqual(scoped.map((row: { id: string }) => row.id), await oldRecentPaymentIds(team.id, 50));
});

test('due dates: repeated answers are equal, and each call gets its own Date', () => {
    const first = dueDateFor(2026, 9, 25);
    first.setFullYear(1999);
    const second = dueDateFor(2026, 9, 25);
    assert.equal(second.toISOString(), '2026-10-25T21:59:59.000Z');
    assert.notEqual(first, second);
    assert.equal(dueDateFor(2026, 1, 31).toISOString(), '2026-02-28T21:59:59.000Z');
    assert.equal(dueDateFor(2026, 1, 31).toISOString(), '2026-02-28T21:59:59.000Z');
});

test('Acasă: the dashboard still answers with the shared fee figures', async () => {
    const { status, body } = await api.call('GET', '/dashboard/summary', { auth: admin });
    assert.equal(status, 200);
    assert.equal(typeof body.feesDueByMonthEnd, 'number');
    assert.ok(body.owingPlayersCount >= 1);
});
