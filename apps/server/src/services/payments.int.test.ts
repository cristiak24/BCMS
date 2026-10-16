import '../test/pgliteEnv';
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { eq } from 'drizzle-orm';
import { db } from '../db';
import { clubs, events, financialSettings, notifications, playerPayments, players, playersToTeams, teams, users } from '../db/schema';
import { closeDb, createSchema } from '../test/pgliteDb';
import { applyCheckoutSession, feeIdMetadata, previewManualPayment, recordManualPayment } from './payments';
import { clubBalances } from './clubFinance';
import { monthKey } from '../lib/paymentLedger';
import { clubMonth } from '../lib/clubTime';
import { sendPaymentReminders } from '../lib/notifications';

/**
 * End-to-end money rules against a real Postgres (PGlite, in memory): the
 * flows the audit found broken — duplicate Stripe payments, paid fees still
 * due, abandoned checkouts becoming debts, arrears vanishing.
 */

const now = new Date();
// Months are Romanian calendar months, whatever TZ the test runs in.
const current = clubMonth(now);
const thisMonth = monthKey(current.year, current.month);
const monthsAgo = (n: number) => {
    const index = current.year * 12 + current.month - 1 - n;
    return monthKey(Math.floor(index / 12), (index % 12) + 1);
};

let clubId = 0;
let teamId = 0;
let deskUserId = 0;
let seq = 0;

/** A desk payment taken by the club's accountant. */
function desk(playerId: number, amount: number, feeIds?: string[], description = 'Plată numerar') {
    return recordManualPayment({ playerId, clubId, amount, when: now, method: 'cash', description, feeIds, paidByUserId: deskUserId });
}

function feeOf(balance: { fees: Array<{ id: string; amount: number }> }, id: string) {
    return balance.fees.find((fee) => fee.id === id);
}

async function withBillingStart(month: string | null, run: () => Promise<void>) {
    await db.update(financialSettings).set({ billingStartMonth: month }).where(eq(financialSettings.clubId, clubId));
    try {
        await run();
    } finally {
        await db.update(financialSettings).set({ billingStartMonth: null }).where(eq(financialSettings.clubId, clubId));
    }
}

async function newPlayer(name: string) {
    const [player] = await db.insert(players).values({
        name, firstName: name, lastName: 'Test', status: 'active', teamId,
        createdAt: new Date(now.getFullYear() - 1, 0, 1).toISOString(),
    }).returning();
    return player;
}

async function balanceOf(playerId: number) {
    const rows = await clubBalances(clubId, { now });
    return rows.find((row) => row.playerId === playerId)!;
}

function paidSession(playerId: number, feeIds: string[], amount: number) {
    seq += 1;
    return {
        id: `cs_test_${seq}`,
        mode: 'payment',
        payment_status: 'paid',
        amount_total: Math.round(amount * 100),
        currency: 'ron',
        metadata: { playerId: String(playerId), label: 'Plată test', ...feeIdMetadata(feeIds) },
    };
}

before(async () => {
    await createSchema();
    const [club] = await db.insert(clubs).values({ name: 'Club Test', normalizedName: 'club test' }).returning();
    clubId = club.id;
    const [team] = await db.insert(teams).values({
        frbTeamId: '', name: 'U12', frbLeagueId: '', leagueName: 'Liga', frbSeasonId: '', seasonName: '2026', inviteCode: 'ABC123', clubId,
    }).returning();
    teamId = team.id;
    await db.insert(financialSettings).values({ clubId, monthlyPlayerFee: 150, trainingLevy: 0, facilityFee: 0, autoAdjust: 1, paymentDueDay: 25, billingStartMonth: null });
    const [accountant] = await db.insert(users).values({ email: 'contabil@test.local', name: 'Contabil Test', role: 'accountant', status: 'active', clubId }).returning();
    deskUserId = accountant.id;
});

after(async () => {
    await closeDb();
});

test('a Stripe payment confirmed twice (webhook + browser) is recorded once', async () => {
    const player = await newPlayer('Ana');
    const session = paidSession(player.id, [`monthly:${thisMonth}`], 150);

    const first = await applyCheckoutSession(session, 'paid');
    const second = await applyCheckoutSession(session, 'paid');
    assert.equal(first.recorded, true);
    assert.equal(second.recorded, false);

    const rows = await db.select().from(playerPayments).where(eq(playerPayments.playerId, player.id));
    assert.equal(rows.length, 1);
    assert.equal(Number(rows[0].amount), 150);
    assert.equal((await balanceOf(player.id)).outstanding, 0);
});

test('an abandoned checkout records nothing; a failed one is history, not debt', async () => {
    const player = await newPlayer('Bogdan');
    const expired = await applyCheckoutSession(paidSession(player.id, [`monthly:${thisMonth}`], 150), 'expired');
    assert.equal(expired.recorded, false);

    const failedSession = { ...paidSession(player.id, [`monthly:${thisMonth}`], 150), payment_status: 'unpaid' };
    await applyCheckoutSession(failedSession, 'failed');
    const rows = await db.select().from(playerPayments).where(eq(playerPayments.playerId, player.id));
    assert.deepEqual(rows.map((row) => row.status), ['failed']);

    const balance = await balanceOf(player.id);
    assert.equal(balance.outstanding, 150, 'still owes the month, once — not the failed basket on top');
});

test('a paid event fee does not settle the monthly fee', async () => {
    const player = await newPlayer('Cristi');
    const [event] = await db.insert(events).values({
        type: 'match', title: 'Turneu', startTime: new Date(now.getTime() + 7 * 864e5).toISOString(),
        endTime: new Date(now.getTime() + 7 * 864e5 + 36e5).toISOString(), teamId, amount: 20.5,
    }).returning();

    const before = await balanceOf(player.id);
    assert.ok(before.fees.some((fee) => fee.id === `event:${event.id}`));
    await applyCheckoutSession(paidSession(player.id, [`event:${event.id}`], 20.5), 'paid');

    const afterPay = await balanceOf(player.id);
    assert.equal(afterPay.fees.some((fee) => fee.id === `event:${event.id}`), false);
    assert.ok(afterPay.fees.some((fee) => fee.id === `monthly:${thisMonth}`), 'the month is still due');
    await db.delete(events).where(eq(events.id, event.id));
});

test('desk payments keep bani and record who took the money', async () => {
    const player = await newPlayer('Dana');
    const { payment } = await desk(player.id, 150, [`monthly:${thisMonth}`], 'Chitanța 12');
    assert.equal(Number(payment.amount), 150);
    assert.equal(payment.method, 'cash');
    assert.equal(payment.paidByUserId, deskUserId, 'P1-11: paid_by_user_id is no longer null');
    assert.equal(feeOf(await balanceOf(player.id), `monthly:${thisMonth}`), undefined);
});

test('5 RON cash towards a 150 RON fee leaves 145 RON owed (P0-2)', async () => {
    const player = await newPlayer('Matei');
    const { payment } = await desk(player.id, 5, [`monthly:${thisMonth}`]);
    assert.equal(payment.feeIds, `monthly:${thisMonth}=5`);
    const balance = await balanceOf(player.id);
    assert.equal(feeOf(balance, `monthly:${thisMonth}`)?.amount, 145);
    assert.equal(balance.outstanding, 145);

    // 49,50 + 95,50 more: the fee is settled exactly when it is covered.
    await desk(player.id, 49.5, [`monthly:${thisMonth}`]);
    assert.equal((await balanceOf(player.id)).outstanding, 95.5);
    const { payment: last } = await desk(player.id, 95.5, [`monthly:${thisMonth}`]);
    assert.equal(last.feeIds, `monthly:${thisMonth}`);
    assert.equal((await balanceOf(player.id)).outstanding, 0);
});

test('50 RON on 300 RON of arrears keeps the player in „Cu restanțe”', async () => {
    await withBillingStart(monthsAgo(2), async () => {
        const player = await newPlayer('Luca');
        await desk(player.id, 50, [`monthly:${monthsAgo(2)}`, `monthly:${monthsAgo(1)}`]);
        const balance = await balanceOf(player.id);
        assert.equal(balance.state, 'overdue');
        assert.equal(feeOf(balance, `monthly:${monthsAgo(2)}`)?.amount, 100);
        assert.equal(balance.outstanding, 400);
    });
});

test('without fee ids a desk payment pays the oldest month first, not the current one', async () => {
    await withBillingStart(monthsAgo(2), async () => {
        const player = await newPlayer('Ioana');
        const { payment } = await desk(player.id, 200);
        assert.equal(payment.feeIds, `monthly:${monthsAgo(2)},monthly:${monthsAgo(1)}=50`);
        const balance = await balanceOf(player.id);
        assert.equal(feeOf(balance, `monthly:${monthsAgo(2)}`), undefined);
        assert.equal(feeOf(balance, `monthly:${monthsAgo(1)}`)?.amount, 100);
        assert.equal(feeOf(balance, `monthly:${thisMonth}`)?.amount, 150);
    });
});

test('an overpayment stays as an advance instead of vanishing', async () => {
    const player = await newPlayer('Radu');
    const { payment } = await desk(player.id, 200, [`monthly:${thisMonth}`]);
    assert.equal(payment.feeIds, `monthly:${thisMonth},credit=50`);
    const balance = await balanceOf(player.id);
    assert.equal(balance.outstanding, 0);
    assert.equal(balance.credit, 50);
});

test('the preview is exactly what the save books', async () => {
    await withBillingStart(monthsAgo(1), async () => {
        const player = await newPlayer('Sorin');
        const preview = await previewManualPayment({ playerId: player.id, clubId, amount: 170, feeIds: [`monthly:${thisMonth}`] });
        assert.deepEqual(preview.lines.map((line) => [line.feeId, line.applied, line.owedAfter]), [
            [`monthly:${monthsAgo(1)}`, 20, 130],
            [`monthly:${thisMonth}`, 150, 0],
        ]);
        assert.equal((await db.select().from(playerPayments).where(eq(playerPayments.playerId, player.id))).length, 0, 'a preview writes nothing');
        const { plan } = await desk(player.id, 170, [`monthly:${thisMonth}`]);
        assert.deepEqual(plan.lines, preview.lines);
    });
});

test('two desk payments at once are split one after the other', async () => {
    await withBillingStart(monthsAgo(1), async () => {
        const player = await newPlayer('Tudor');
        await Promise.all([desk(player.id, 100), desk(player.id, 100)]);
        const balance = await balanceOf(player.id);
        assert.equal(balance.outstanding, 100, '300 owed − 200 paid, not both on the same month');
        assert.equal(feeOf(balance, `monthly:${monthsAgo(1)}`), undefined);
    });
});

test('a club request paid in part is not voided', async () => {
    const player = await newPlayer('Vlad');
    const [request] = await db.insert(playerPayments).values({
        playerId: player.id, amount: 80, month: current.month, year: current.year, status: 'pending', description: 'Echipament',
    }).returning();
    await desk(player.id, 30, [`payment:${request.id}`]);
    const [row] = await db.select().from(playerPayments).where(eq(playerPayments.id, request.id));
    assert.equal(row.status, 'pending');
    assert.equal(feeOf(await balanceOf(player.id), `payment:${request.id}`)?.amount, 50);

    await desk(player.id, 50, [`payment:${request.id}`]);
    const [settled] = await db.select().from(playerPayments).where(eq(playerPayments.id, request.id));
    assert.equal(settled.status, 'void');
});

test('arrears inside the billing window stay owed until paid', async () => {
    await db.update(financialSettings).set({ billingStartMonth: monthsAgo(2) }).where(eq(financialSettings.clubId, clubId));
    const player = await newPlayer('Elena');

    const owed = await balanceOf(player.id);
    assert.deepEqual(owed.fees.map((fee) => fee.id).sort(), [`monthly:${monthsAgo(2)}`, `monthly:${monthsAgo(1)}`, `monthly:${thisMonth}`].sort());
    assert.equal(owed.state, 'overdue');

    await desk(player.id, 150, [`monthly:${monthsAgo(2)}`], 'Restanță');
    const left = await balanceOf(player.id);
    assert.equal(left.outstanding, 300);
    assert.equal(left.fees.some((fee) => fee.id === `monthly:${monthsAgo(2)}`), false);

    await db.update(financialSettings).set({ billingStartMonth: null }).where(eq(financialSettings.clubId, clubId));
});

test('paying a club request voids it instead of counting it twice', async () => {
    const player = await newPlayer('Florin');
    const [request] = await db.insert(playerPayments).values({
        playerId: player.id, amount: 80, month: current.month, year: current.year, status: 'pending', description: 'Echipament',
    }).returning();
    assert.ok((await balanceOf(player.id)).fees.some((fee) => fee.id === `payment:${request.id}`));

    await applyCheckoutSession(paidSession(player.id, [`payment:${request.id}`], 80), 'paid');
    const [after] = await db.select().from(playerPayments).where(eq(playerPayments.id, request.id));
    assert.equal(after.status, 'void');
    assert.equal((await balanceOf(player.id)).fees.some((fee) => fee.id === `payment:${request.id}`), false);
});

test('an inactive player is not billed new months', async () => {
    const player = await newPlayer('Gelu');
    await db.update(players).set({ status: 'inactive' }).where(eq(players.id, player.id));
    assert.equal((await balanceOf(player.id)).outstanding, 0);
});

test('payment reminders go only to families with something past due', async () => {
    await withBillingStart(monthsAgo(2), async () => {
        const late = await newPlayer('Zoe');
        // Joined this month: owes this month's fee, which is not due yet.
        const [fresh] = await db.insert(players).values({ name: 'Yanis', firstName: 'Yanis', lastName: 'Test', status: 'active', teamId, createdAt: now.toISOString() }).returning();
        const accounts = await db.insert(users).values([
            { email: 'zoe@test.local', name: 'Părinte Zoe', role: 'parent', status: 'active', clubId },
            { email: 'yanis@test.local', name: 'Părinte Yanis', role: 'parent', status: 'active', clubId },
        ]).returning();
        await db.update(players).set({ userId: accounts[0].id }).where(eq(players.id, late.id));
        await db.update(players).set({ userId: accounts[1].id }).where(eq(players.id, fresh.id));

        const balances = (await clubBalances(clubId, { now })).filter((row) => row.playerId === late.id || row.playerId === fresh.id);
        assert.equal(balances.find((row) => row.playerId === fresh.id)?.state, 'due');
        const result = await sendPaymentReminders(balances);
        assert.equal(result.notified, 1);
        const sent = await db.select().from(notifications).where(eq(notifications.type, 'payment_reminder'));
        assert.deepEqual(sent.map((row) => row.userId), [accounts[0].id]);
        assert.match(sent[0].message, /RON restanți/);
    });
});

// ── Who is billed (user decision 2026-10-16): only players on an active team ──

async function newTeam(name: string, isActive: boolean) {
    const [team] = await db.insert(teams).values({
        frbTeamId: '', name, frbLeagueId: '', leagueName: 'Liga', frbSeasonId: '', seasonName: '2026', inviteCode: `T${name}`, clubId, isActive,
    }).returning();
    return team;
}

test('a player left only on a deactivated team is not billed', async () => {
    const closed = await newTeam('U18', false);
    const [player] = await db.insert(players).values({
        name: 'Paul', firstName: 'Paul', lastName: 'Test', status: 'active', teamId: closed.id,
        createdAt: new Date(now.getFullYear() - 1, 0, 1).toISOString(),
    }).returning();
    // An upcoming tournament of the deactivated team is not billed either.
    await db.insert(events).values({
        type: 'match', title: 'Turneu U18', startTime: new Date(now.getTime() + 5 * 864e5).toISOString(),
        endTime: new Date(now.getTime() + 5 * 864e5 + 36e5).toISOString(), teamId: closed.id, amount: 40,
    });
    const balance = await balanceOf(player.id);
    assert.equal(balance.outstanding, 0);
    assert.deepEqual(balance.fees, []);

    // Also on an active team: billed again (the active team's month, not the closed team's event).
    await db.insert(playersToTeams).values({ playerId: player.id, teamId });
    const billed = await balanceOf(player.id);
    assert.deepEqual(billed.fees.map((fee) => fee.id), [`monthly:${thisMonth}`]);
});

test('a player taken off every team is not billed', async () => {
    // Still on the club's books through their own account, but on no team.
    await db.insert(users).values({ email: 'fara.echipa@test.local', name: 'Fără Echipă', role: 'player', status: 'active', clubId });
    const [player] = await db.insert(players).values({
        name: 'Ilie', firstName: 'Ilie', lastName: 'Test', status: 'active', teamId: null, email: 'fara.echipa@test.local',
        createdAt: new Date(now.getFullYear() - 1, 0, 1).toISOString(),
    }).returning();
    const balance = await balanceOf(player.id);
    assert.ok(balance, 'still listed in the club balances');
    assert.equal(balance.outstanding, 0);
});
