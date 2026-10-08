import '../test/pgliteEnv';
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { eq } from 'drizzle-orm';
import { db } from '../db';
import { clubs, events, financialSettings, playerPayments, players, teams } from '../db/schema';
import { closeDb, createSchema } from '../test/pgliteDb';
import { applyCheckoutSession, feeIdMetadata, recordManualPayment } from './payments';
import { clubBalances } from './clubFinance';
import { monthKey } from '../lib/paymentLedger';

/**
 * End-to-end money rules against a real Postgres (PGlite, in memory): the
 * flows the audit found broken — duplicate Stripe payments, paid fees still
 * due, abandoned checkouts becoming debts, arrears vanishing.
 */

const now = new Date();
const thisMonth = monthKey(now.getFullYear(), now.getMonth() + 1);
const monthsAgo = (n: number) => {
    const date = new Date(now.getFullYear(), now.getMonth() - n, 1);
    return monthKey(date.getFullYear(), date.getMonth() + 1);
};

let clubId = 0;
let teamId = 0;
let seq = 0;

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

test('desk payments keep bani and settle exactly the chosen fees', async () => {
    const player = await newPlayer('Dana');
    const { payment } = await recordManualPayment({
        playerId: player.id, amount: 49.5, when: now, method: 'cash', description: 'Chitanța 12', feeIds: [`monthly:${thisMonth}`],
    });
    assert.equal(Number(payment.amount), 49.5);
    assert.equal(payment.method, 'cash');
    assert.equal((await balanceOf(player.id)).fees.some((fee) => fee.id === `monthly:${thisMonth}`), false);
});

test('arrears inside the billing window stay owed until paid', async () => {
    await db.update(financialSettings).set({ billingStartMonth: monthsAgo(2) }).where(eq(financialSettings.clubId, clubId));
    const player = await newPlayer('Elena');

    const owed = await balanceOf(player.id);
    assert.deepEqual(owed.fees.map((fee) => fee.id).sort(), [`monthly:${monthsAgo(2)}`, `monthly:${monthsAgo(1)}`, `monthly:${thisMonth}`].sort());
    assert.equal(owed.state, 'overdue');

    await recordManualPayment({ playerId: player.id, amount: 150, when: now, method: 'transfer', description: 'Restanță', feeIds: [`monthly:${monthsAgo(2)}`] });
    const left = await balanceOf(player.id);
    assert.equal(left.outstanding, 300);
    assert.equal(left.fees.some((fee) => fee.id === `monthly:${monthsAgo(2)}`), false);

    await db.update(financialSettings).set({ billingStartMonth: null }).where(eq(financialSettings.clubId, clubId));
});

test('paying a club request voids it instead of counting it twice', async () => {
    const player = await newPlayer('Florin');
    const [request] = await db.insert(playerPayments).values({
        playerId: player.id, amount: 80, month: now.getMonth() + 1, year: now.getFullYear(), status: 'pending', description: 'Echipament',
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
