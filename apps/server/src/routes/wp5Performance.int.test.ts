import '../test/pgliteEnv';
import { bearer } from '../test/fakeClerk';
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { db } from '../db';
import { attendance, clubs, events, financialDocuments, financialSettings, playerPayments, players, playersToTeams, teams, users } from '../db/schema';
import { closeDb, createSchema } from '../test/pgliteDb';
import { serve } from '../test/serve';
import playerRoutes from './playerRoutes';
import financeRoutes from './finance';
import dashboardRoutes from './dashboard';
import eventRoutes from './eventRoutes';
import { toDate } from '../lib/dateUtils';
import { isPaidStatus } from '../lib/paymentLedger';
import { attendanceSummary, isAttendedStatus, isCountedStatus } from '../lib/attendanceRate';

/**
 * WP5 (audit 2026-10-15, performance): Lot, Finanțe and the dashboard stopped
 * loading the club's whole history into JS — SQL adds it up now, and lists
 * come one page (or one player) at a time. The numbers on screen must not
 * move: each answer here is checked against the old row-by-row calculation
 * on the same data.
 */

const admin = bearer('user_adm', 'adm@club.ro');
const DAY = 24 * 60 * 60 * 1000;
const now = new Date();
const iso = (date: Date) => date.toISOString();
const daysAgo = (days: number) => new Date(now.getTime() - days * DAY);
const thisMonth = new Date(now.getFullYear(), now.getMonth(), 1, 12);
const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 15, 12);

let api: Awaited<ReturnType<typeof serve>>;
let clubId = 0;
const playerIds: number[] = [];

before(async () => {
    await createSchema();
    const [club] = await db.insert(clubs).values({ name: 'Club', normalizedName: 'club' }).returning();
    clubId = club.id;
    await db.insert(users).values({ email: 'adm@club.ro', name: 'Admin', role: 'admin', status: 'active', clubId, firebaseUid: 'user_adm' });
    const billingStart = new Date(now.getFullYear(), now.getMonth() - 5, 1);
    await db.insert(financialSettings).values({
        clubId, monthlyPlayerFee: 150, trainingLevy: 20, facilityFee: 0, autoAdjust: 1, paymentDueDay: 25,
        billingStartMonth: `${billingStart.getFullYear()}-${String(billingStart.getMonth() + 1).padStart(2, '0')}`,
    });
    const teamRows = await db.insert(teams).values(['U12', 'U14'].map((name, index) => ({
        frbTeamId: '', name, frbLeagueId: '', leagueName: 'Liga', frbSeasonId: '', seasonName: '2026', inviteCode: `T${index}0000`, clubId,
    }))).returning();

    const names = ['Ana', 'Radu', 'Ștefan', 'Luca', 'Matei', 'Ioana', 'Sara'];
    for (const [index, firstName] of names.entries()) {
        const teamId = teamRows[index % 2].id;
        const [row] = await db.insert(players).values({
            firstName, lastName: 'Pop', name: `${firstName} Pop`, number: index + 4, teamId,
            status: index === 2 ? 'inactive' : 'active', createdAt: iso(daysAgo(400)),
        }).returning();
        await db.insert(playersToTeams).values({ playerId: row.id, teamId });
        playerIds.push(row.id);
    }

    // Sessions over 14 months; statuses include the spellings the app has met.
    const statuses = ['present', 'absent', 'late', 'excused', 'Present ', 'prezent', 'medical', 'absent'];
    let n = 0;
    for (const days of [1, 5, 12, 20, 29, 31, 35, 44, 58, 61, 90, 200, 420]) {
        for (const team of teamRows) {
            const start = daysAgo(days);
            const [event] = await db.insert(events).values({
                type: days % 2 ? 'training' : 'match', title: `Sesiune ${days}`, startTime: iso(start), endTime: iso(new Date(start.getTime() + 90 * 60000)),
                teamId: team.id, amount: days === 44 ? 25 : null,
            }).returning();
            const roster = playerIds.filter((_, index) => teamRows[index % 2].id === team.id);
            await db.insert(attendance).values(roster.map((playerId) => ({
                playerId, teamId: team.id, eventId: event.id, date: iso(start), status: statuses[(n += 1) % statuses.length],
            })));
        }
    }

    // Payments: full, partial, failed, with and without a date, this month, last month, long ago.
    const key = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    await db.insert(playerPayments).values([
        { playerId: playerIds[0], amount: 170, month: lastMonth.getMonth() + 1, year: lastMonth.getFullYear(), status: 'paid', date: iso(lastMonth), feeIds: `monthly:${key(lastMonth)},levy:${key(lastMonth)}` },
        { playerId: playerIds[0], amount: 50.5, month: thisMonth.getMonth() + 1, year: thisMonth.getFullYear(), status: 'paid', date: iso(thisMonth), feeIds: `monthly:${key(thisMonth)}=50.5` },
        { playerId: playerIds[1], amount: 170, month: thisMonth.getMonth() + 1, year: thisMonth.getFullYear(), status: 'failed', date: iso(thisMonth), feeIds: `monthly:${key(thisMonth)}` },
        { playerId: playerIds[1], amount: 99.99, month: 1, year: now.getFullYear() - 2, status: 'Succeeded', date: null, createdAt: iso(lastMonth) },
        { playerId: playerIds[3], amount: 340, month: 1, year: now.getFullYear() - 1, status: 'paid', date: iso(daysAgo(500)), feeIds: 'credit=340' },
        { playerId: playerIds[4], amount: 170, month: 1, year: now.getFullYear(), status: 'pending', date: iso(thisMonth) },
    ]);
    await db.insert(financialDocuments).values([
        { type: 'Income', amount: 1000, status: 'processed', clubId, date: iso(thisMonth) },
        { type: 'Invoice', amount: 320.25, status: 'processed', clubId, date: iso(lastMonth) },
        { type: 'expense', amount: 80, status: 'processed', clubId, date: iso(daysAgo(300)) },
        { type: 'Income', amount: 999, status: 'pending', clubId, date: iso(thisMonth) },
    ]);

    api = await serve({ '/players': playerRoutes, '/finance': financeRoutes, '/dashboard': dashboardRoutes, '/events': eventRoutes });
});

after(async () => {
    await api.close();
    await closeDb();
});

test('Lot: attendance and payment per player match the old calculation over every row', async () => {
    const { status, body } = await api.call('GET', '/players/roster', { auth: admin });
    assert.equal(status, 200);
    const rows = await db.select().from(attendance);
    for (const id of playerIds) {
        const own = rows.filter((row) => row.playerId === id && isCountedStatus(row.status));
        const present = own.filter((row) => isAttendedStatus(row.status)).length;
        const expected = own.length ? Math.round((present / own.length) * 100) : 0;
        assert.equal(body.find((row: { id: number }) => row.id === id).attendanceRate, expected, `player ${id}`);
    }
    const balances = (await api.call('GET', '/finance/admin/balances', { auth: admin })).body.players as Array<{ playerId: number; state: string }>;
    for (const balance of balances) {
        const expected = balance.state === 'paid' ? 'paid' : balance.state === 'overdue' ? 'overdue' : 'pending';
        assert.equal(body.find((row: { id: number }) => row.id === balance.playerId).paymentStatus, expected);
    }
});

test('Lot summary: the 30-day windows match the old in-JS filtering', async () => {
    const { body } = await api.call('GET', '/players/roster/summary', { auth: admin });
    const rows = await db.select().from(attendance);
    const currentStart = new Date(now);
    currentStart.setDate(currentStart.getDate() - 30);
    const previousStart = new Date(currentStart);
    previousStart.setDate(previousStart.getDate() - 30);
    const at = (row: { date: string }) => toDate(row.date)!;
    const current = attendanceSummary(rows.filter((row) => at(row) >= currentStart && at(row) <= new Date())).rate;
    const previous = attendanceSummary(rows.filter((row) => at(row) >= previousStart && at(row) < currentStart)).rate;
    assert.notEqual(current, null);
    assert.equal(body.currentPeriodAttendance, current);
    assert.equal(body.previousPeriodAttendance, previous);
    assert.equal(body.athleteCount, playerIds.length);
});

test('Lot pages: walking every page gives the filtered, sorted list exactly once', async () => {
    const full = (await api.call('GET', '/players/roster?page=1&pageSize=all&status=active&sort=attendance&dir=desc', { auth: admin })).body;
    assert.equal(full.total, playerIds.length - 1);
    assert.equal(full.rosterTotal, playerIds.length);
    const seen: number[] = [];
    for (let page = 1; page <= 3; page += 1) {
        // 12 is the smallest page Lot offers; the roster here is 7, so ask with a tiny, refused size → 12.
        const { body } = await api.call('GET', `/players/roster?page=${page}&pageSize=12&status=active&sort=attendance&dir=desc`, { auth: admin });
        if (body.page !== page) break;
        seen.push(...body.items.map((row: { id: number }) => row.id));
    }
    assert.deepEqual(seen, full.items.map((row: { id: number }) => row.id));
    const rates = full.items.map((row: { attendanceRate: number }) => row.attendanceRate);
    assert.deepEqual(rates, [...rates].sort((a, b) => b - a));
});

test('the player page reads one row with the same attendance as Lot', async () => {
    const roster = (await api.call('GET', '/players/roster', { auth: admin })).body as Array<{ id: number; attendanceRate: number; teamName: string }>;
    for (const id of playerIds.slice(0, 3)) {
        const { status, body } = await api.call('GET', `/players/${id}`, { auth: admin });
        assert.equal(status, 200);
        const row = roster.find((entry) => entry.id === id)!;
        assert.equal(body.attendanceRate, row.attendanceRate);
        assert.equal(body.teamName, row.teamName);
    }
});

test('Finanțe: the list carries totals only; fees come per player, identical to the full list', async () => {
    const summary = await api.call('GET', '/finance/admin/balances', { auth: admin });
    const full = await api.call('GET', '/finance/admin/balances?include=fees', { auth: admin });
    assert.equal(summary.status, 200);
    assert.equal(summary.body.players.length, full.body.players.length);
    assert.ok(JSON.stringify(summary.body).length < JSON.stringify(full.body).length / 3);
    for (const [index, row] of summary.body.players.entries()) {
        const complete = full.body.players[index];
        assert.equal(row.playerId, complete.playerId, 'same order');
        assert.equal(row.fees, undefined);
        for (const field of ['outstanding', 'overdue', 'overdueCount', 'oldestOverdue', 'state', 'credit', 'teamName', 'playerName']) {
            assert.deepEqual(row[field], complete[field], field);
        }
        assert.equal(row.feeCount, complete.fees.length);
        assert.equal(row.oldestDueDate, complete.fees.map((fee: { dueDate: string | null }) => fee.dueDate).filter(Boolean).sort()[0] ?? null);

        const one = await api.call('GET', `/finance/admin/balances/${row.playerId}`, { auth: admin });
        assert.equal(one.status, 200);
        assert.deepEqual(one.body.fees, complete.fees);
        assert.equal(one.body.outstanding, complete.outstanding);
        assert.equal(one.body.overdue, complete.overdue);
    }
    assert.equal((await api.call('GET', '/finance/admin/balances/999999', { auth: admin })).status, 404);
});

test('Dashboard: money and attendance sums match the old row-by-row totals', async () => {
    const { status, body } = await api.call('GET', '/dashboard/summary', { auth: admin });
    assert.equal(status, 200);
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
    const startOfPrev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const endOfPrev = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);
    const inRange = (date: Date | null, start: Date, end: Date) => (date ? date >= start && date <= end : false);

    const paid = (await db.select().from(playerPayments)).filter((row) => isPaidStatus(row.status));
    const paymentIn = (start: Date, end: Date) => paid.filter((row) => inRange(toDate(row.date ?? row.createdAt), start, end)).reduce((sum, row) => sum + Number(row.amount), 0);
    const docs = (await db.select().from(financialDocuments)).filter((doc) => doc.status === 'processed');
    const expense = (type: string) => ['expense', 'invoice'].includes(type.toLowerCase());
    const docsIn = (isExpense: boolean, start?: Date, end?: Date) => docs
        .filter((doc) => expense(doc.type) === isExpense && (!start || inRange(toDate(doc.date), start, end!)))
        .reduce((sum, doc) => sum + Number(doc.amount), 0);

    assert.equal(body.totalIncome, docsIn(false) + paid.reduce((sum, row) => sum + Number(row.amount), 0));
    assert.equal(body.totalExpense, docsIn(true));
    assert.equal(body.monthlyIncome, docsIn(false, startOfMonth, endOfMonth) + paymentIn(startOfMonth, endOfMonth));
    assert.equal(body.monthlyExpense, docsIn(true, startOfMonth, endOfMonth));
    assert.equal(body.previousMonthIncome, docsIn(false, startOfPrev, endOfPrev) + paymentIn(startOfPrev, endOfPrev));

    const rows = (await db.select().from(attendance)).filter((row) => isCountedStatus(row.status));
    const month = rows.filter((row) => inRange(toDate(row.date), startOfMonth, endOfMonth));
    assert.equal(body.totalAttendanceRecords, month.length);
    assert.equal(body.presentCount, month.filter((row) => isAttendedStatus(row.status)).length);
});

test('events: a request without range or team stops a year back; a team or range keeps its bounds', async () => {
    const all = (await api.call('GET', '/events', { auth: admin })).body as Array<{ startTime: string }>;
    assert.ok(all.length > 0);
    assert.ok(all.every((event) => new Date(event.startTime) >= daysAgo(366)));
    const team = (await api.call('GET', `/events?teamId=${(await db.select().from(teams))[0].id}`, { auth: admin })).body as unknown[];
    assert.equal(team.length, 13);
    const ranged = (await api.call('GET', `/events?start=${iso(daysAgo(500))}`, { auth: admin })).body as unknown[];
    assert.equal(ranged.length, 26);
});
