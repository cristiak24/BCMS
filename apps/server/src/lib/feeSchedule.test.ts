import test from 'node:test';
import assert from 'node:assert/strict';
import { billedMonths, computePlayerFees, computePlayerLedger, dueDateFor, planPayment, summarizeFees, type FeeInput, type FeeSettings, type LedgerRow } from './feeSchedule';

const settings = (over: Partial<FeeSettings> = {}): FeeSettings => ({
    monthlyPlayerFee: 150,
    trainingLevy: 0,
    facilityFee: 0,
    paymentDueDay: 25,
    billingStartMonth: null,
    ...over,
});

const input = (over: Partial<FeeInput> = {}): FeeInput => ({
    settings: settings(),
    rows: [],
    events: [],
    attendedEventIds: new Set(),
    playerSince: '2025-01-10T00:00:00.000Z',
    now: new Date(2026, 9, 7, 12), // 7 Oct 2026
    ...over,
});

test('without a billing start only the current month is billed (old behaviour)', () => {
    const fees = computePlayerFees(input());
    assert.deepEqual(fees.map((fee) => fee.id), ['monthly:2026-10']);
    assert.equal(fees[0].status, 'upcoming');
});

test('arrears inside the billing window stay owed and turn overdue after the due day', () => {
    const fees = computePlayerFees(input({ settings: settings({ billingStartMonth: '2026-08' }) }));
    assert.deepEqual(fees.map((fee) => `${fee.id}:${fee.status}`), [
        'monthly:2026-08:overdue', // due 25 Sep
        'monthly:2026-09:pending', // due 25 Oct
        'monthly:2026-10:upcoming',
    ]);
    const totals = summarizeFees(fees);
    assert.equal(totals.outstanding, 450);
    assert.equal(totals.overdue, 150);
    assert.equal(totals.state, 'overdue');
});

test('months before the player joined are never billed', () => {
    const months = billedMonths(settings({ billingStartMonth: '2026-01' }), '2026-09-15T00:00:00.000Z', new Date(2026, 9, 7));
    assert.deepEqual(months, [{ year: 2026, month: 9 }, { year: 2026, month: 10 }]);
});

test('a payment settles exactly the fees it lists', () => {
    const fees = computePlayerFees(input({
        settings: settings({ billingStartMonth: '2026-09', trainingLevy: 20 }),
        rows: [{ id: 1, status: 'paid', feeIds: 'monthly:2026-09,levy:2026-10', month: 10, year: 2026, amount: 170 }],
    }));
    assert.deepEqual(fees.map((fee) => fee.id).sort(), ['levy:2026-09', 'monthly:2026-10']);
});

test('a paid event fee does not settle the month, and failed rows are not debts', () => {
    const fees = computePlayerFees(input({
        rows: [
            { id: 1, status: 'paid', feeIds: 'event:9', month: 10, year: 2026, amount: 20 },
            { id: 2, status: 'failed', feeIds: 'monthly:2026-10', month: 10, year: 2026, amount: 150 },
        ],
    }));
    assert.deepEqual(fees.map((fee) => fee.id), ['monthly:2026-10']);
});

test('past event fees are owed only by attendees, inside the window', () => {
    const events = [
        { id: 5, title: 'Turneu', amount: 50, status: 'scheduled', type: 'match', startTime: '2026-09-20T09:00:00.000Z' },
        { id: 6, title: 'Cantonament', amount: 300, status: 'scheduled', type: 'training', startTime: '2026-11-01T09:00:00.000Z' },
    ];
    const withoutWindow = computePlayerFees(input({ events, attendedEventIds: new Set([5]), settings: settings({ monthlyPlayerFee: 0 }) }));
    assert.deepEqual(withoutWindow.map((fee) => fee.id), ['event:6']);

    const absent = computePlayerFees(input({ events, settings: settings({ monthlyPlayerFee: 0, billingStartMonth: '2026-09' }) }));
    assert.deepEqual(absent.map((fee) => fee.id), ['event:6']);

    const attended = computePlayerFees(input({ events, attendedEventIds: new Set([5]), settings: settings({ monthlyPlayerFee: 0, billingStartMonth: '2026-09' }) }));
    assert.deepEqual(attended.map((fee) => `${fee.id}:${fee.status}`), ['event:5:overdue', 'event:6:upcoming']);
});

test('a club request row for a month replaces that month\'s generated fee', () => {
    const fees = computePlayerFees(input({
        rows: [{ id: 3, status: 'pending', feeIds: null, month: 10, year: 2026, amount: 120 }],
    }));
    assert.deepEqual(fees.map((fee) => fee.id), ['payment:3']);
});

test('due day is clamped to the length of the next month', () => {
    // January's fee, due at the end of 28 February in Romania (EET, UTC+2).
    assert.equal(dueDateFor(2026, 1, 31).toISOString(), '2026-02-28T21:59:59.000Z');
    // December's fee is due in January of the next year.
    assert.equal(dueDateFor(2026, 12, 25).toISOString(), '2027-01-25T21:59:59.000Z');
});

// ── Due dates in Romanian time, whatever the server's time zone (Render: UTC) ──

test('a fee is due at the end of the due day in Romania, DST included', () => {
    assert.equal(dueDateFor(2026, 7, 25).toISOString(), '2026-08-25T20:59:59.000Z'); // EEST, UTC+3
    assert.equal(dueDateFor(2026, 9, 25).toISOString(), '2026-10-25T21:59:59.000Z'); // DST ends that morning
    assert.equal(dueDateFor(2026, 10, 25).toISOString(), '2026-11-25T21:59:59.000Z'); // EET, UTC+2
});

test('the dueDate sent to the client reads as the 25th in Romania, not the 26th', () => {
    const [fee] = computePlayerFees(input({ now: new Date('2026-10-07T09:00:00.000Z') }));
    const shown = new Intl.DateTimeFormat('ro-RO', { day: 'numeric', month: 'numeric', timeZone: 'Europe/Bucharest' }).format(new Date(fee.dueDate!));
    assert.equal(shown, '25.11');
});

test('a fee turns overdue at midnight in Romania, not three hours later', () => {
    const settingsAug = settings({ billingStartMonth: '2026-10' });
    // 23:30 on 25 November in Romania: October's fee is still on time.
    const before = computePlayerFees(input({ settings: settingsAug, now: new Date('2026-11-25T21:30:00.000Z') }));
    assert.equal(before.find((fee) => fee.id === 'monthly:2026-10')?.status, 'pending');
    // 00:30 on 26 November in Romania (22:30 UTC on the 25th): overdue.
    const after = computePlayerFees(input({ settings: settingsAug, now: new Date('2026-11-25T22:30:00.000Z') }));
    assert.equal(after.find((fee) => fee.id === 'monthly:2026-10')?.status, 'overdue');
});

test('the current month is the Romanian one around midnight UTC', () => {
    // 00:30 on 1 November in Romania is still 31 October in UTC.
    const fees = computePlayerFees(input({ now: new Date('2026-10-31T22:30:00.000Z') }));
    assert.deepEqual(fees.map((fee) => fee.id), ['monthly:2026-11']);
});

// ── Payments allocated by amount (audit P0-2) ──

const paid = (id: number, feeIds: string, amount: number): LedgerRow => ({ id, status: 'paid', feeIds, month: 10, year: 2026, amount });

/** Book a desk payment the way the server does and return the new ledger. */
function pay(base: FeeInput, amount: number, feeIds: string[] = [], id = 100) {
    const plan = planPayment(base, amount, feeIds);
    const next = { ...base, rows: [...base.rows, paid(id, plan.tokens.join(','), amount)] };
    return { plan, next, ledger: computePlayerLedger(next) };
}

test('5 RON towards a 150 RON fee leaves 145 RON owed (P0-2)', () => {
    const { plan, ledger } = pay(input(), 5, ['monthly:2026-10']);
    assert.deepEqual(plan.tokens, ['monthly:2026-10=5']);
    assert.deepEqual(plan.settledIds, []);
    assert.equal(ledger.fees.length, 1);
    assert.equal(ledger.fees[0].amount, 145);
    assert.equal(ledger.fees[0].paidAmount, 5);
    assert.equal(summarizeFees(ledger.fees).outstanding, 145);
});

test('50 RON on 170 RON of August fees keeps the player in arrears', () => {
    const base = input({
        settings: settings({ billingStartMonth: '2026-08', trainingLevy: 20 }),
        now: new Date('2026-10-07T09:00:00.000Z'),
    });
    const { plan, ledger } = pay(base, 50, ['monthly:2026-08', 'levy:2026-08']);
    // Same due date: the cotizație is listed (and paid) first.
    assert.deepEqual(plan.tokens, ['monthly:2026-08=50']);
    const august = ledger.fees.filter((fee) => fee.id.endsWith(':2026-08'));
    assert.deepEqual(august.map((fee) => [fee.id, fee.amount, fee.status]), [['monthly:2026-08', 100, 'overdue'], ['levy:2026-08', 20, 'overdue']]);
    const totals = summarizeFees(ledger.fees);
    assert.equal(totals.state, 'overdue');
    assert.equal(totals.overdue, 120);
});

test('partial payments add up until the fee is settled', () => {
    const first = pay(input(), 49.5, ['monthly:2026-10'], 1);
    const second = pay(first.next, 100.5, ['monthly:2026-10'], 2);
    // The last one covers exactly what was left, so it settles the fee in full.
    assert.deepEqual(second.plan.tokens, ['monthly:2026-10']);
    assert.deepEqual(second.plan.settledIds, ['monthly:2026-10']);
    assert.equal(second.ledger.fees.length, 0);
});

test('without ticked fees a payment goes to the oldest fee first (FIFO)', () => {
    const base = input({ settings: settings({ billingStartMonth: '2026-08' }) });
    const { plan, ledger } = pay(base, 200);
    assert.deepEqual(plan.tokens, ['monthly:2026-08', 'monthly:2026-09=50']);
    assert.deepEqual(ledger.fees.map((fee) => [fee.id, fee.amount]), [['monthly:2026-09', 100], ['monthly:2026-10', 150]]);
});

test('money beyond the ticked fees goes to the oldest other fees', () => {
    const base = input({ settings: settings({ billingStartMonth: '2026-08' }) });
    const { plan } = pay(base, 200, ['monthly:2026-10']);
    assert.deepEqual(plan.tokens, ['monthly:2026-10', 'monthly:2026-08=50']);
});

test('an overpayment is kept as an advance and covers the next fees', () => {
    const base = input({ settings: settings({ billingStartMonth: '2026-09' }) });
    const { plan, ledger, next } = pay(base, 400);
    assert.deepEqual(plan.tokens, ['monthly:2026-09', 'monthly:2026-10', 'credit=100']);
    assert.equal(plan.credit, 100);
    assert.equal(ledger.fees.length, 0);
    assert.equal(ledger.credit, 100);

    // November is billed: the advance pays 100 of it.
    const november = computePlayerLedger({ ...next, now: new Date(2026, 10, 7, 12) });
    assert.deepEqual(november.fees.map((fee) => [fee.id, fee.amount, fee.paidAmount]), [['monthly:2026-11', 50, 100]]);
    assert.equal(november.credit, 0);
});

test('a payment against a fee the advance already covers part of is not counted twice', () => {
    // 30 RON of advance, then October's fee (150) is billed and shows 120 owed.
    const base = input({ rows: [paid(1, 'credit=30', 30)] });
    assert.equal(computePlayerFees(base)[0].amount, 120);
    const { plan, ledger } = pay(base, 120, ['monthly:2026-10']);
    assert.deepEqual(plan.tokens, ['monthly:2026-10=120']);
    assert.equal(ledger.fees.length, 0);
    assert.equal(ledger.credit, 0);
});

test('the preview lists what each fee owed before and after', () => {
    const base = input({ settings: settings({ billingStartMonth: '2026-08' }) });
    const { plan } = pay(base, 200);
    assert.deepEqual(plan.lines.map((line) => [line.feeId, line.owedBefore, line.applied, line.owedAfter]), [
        ['monthly:2026-08', 150, 150, 0],
        ['monthly:2026-09', 150, 50, 100],
    ]);
});

test('a partly paid fee is charged only its remainder, and a full settle never turns into an advance', () => {
    const base = input({ rows: [paid(1, 'monthly:2026-10=40', 40)] });
    assert.equal(computePlayerFees(base)[0].amount, 110);
    // Stripe settles the remaining 110 with the bare id: nothing left, no credit.
    const settled = computePlayerLedger({ ...base, rows: [...base.rows, paid(2, 'monthly:2026-10', 110)] });
    assert.equal(settled.fees.length, 0);
    assert.equal(settled.credit, 0);
});

test('rows written before allocation keep their meaning', () => {
    // A bare fee id settles the fee in full whatever the amount (Stripe rows,
    // older desk payments); a row without fee ids settles its own month.
    const fees = computePlayerFees(input({
        settings: settings({ billingStartMonth: '2026-09' }),
        rows: [paid(1, 'monthly:2026-10', 5), { id: 2, status: 'paid', feeIds: null, month: 9, year: 2026, amount: 150 }],
    }));
    assert.deepEqual(fees, []);
});

test('a club request row can be paid in part', () => {
    const base = input({ rows: [{ id: 3, status: 'pending', feeIds: null, month: 10, year: 2026, amount: 120 }] });
    const { plan, ledger } = pay(base, 20, ['payment:3']);
    assert.deepEqual(plan.tokens, ['payment:3=20']);
    assert.deepEqual(plan.settledIds, [], 'the request must not be voided while 100 RON are still owed');
    assert.deepEqual(ledger.fees.map((fee) => [fee.id, fee.amount]), [['payment:3', 100]]);
});
