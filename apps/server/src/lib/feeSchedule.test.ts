import test from 'node:test';
import assert from 'node:assert/strict';
import { billedMonths, computePlayerFees, dueDateFor, summarizeFees, type FeeInput, type FeeSettings } from './feeSchedule';

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
    const due = dueDateFor(2026, 1, 31); // January's fee, due in February
    assert.equal(due.getMonth(), 1);
    assert.equal(due.getDate(), 28);
});
