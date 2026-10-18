import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compareBalances, summarizeBalance } from './balanceSummary';
import { summarizeFees, type ComputedFee } from './feeSchedule';

function fee(id: string, amount: number, status: ComputedFee['status'], dueDate: string | null): ComputedFee {
    return { id, kind: 'monthly', label: id, description: '', amount, status, dueDate, icon: 'training' };
}

const fees = [
    fee('monthly:2026-08', 150, 'overdue', '2026-09-25T20:59:59.000Z'),
    fee('monthly:2026-09', 150, 'pending', '2026-10-25T20:59:59.000Z'),
    fee('event:4', 30, 'upcoming', null),
];
const balance = { playerId: 7, playerName: 'Ana Pop', teamName: 'U12', status: 'active', fees, credit: 0, ...summarizeFees(fees) };

test('the list row keeps every total and drops the fee-by-fee detail', () => {
    const row = summarizeBalance(balance);
    assert.equal('fees' in row, false);
    assert.equal(row.outstanding, 330);
    assert.equal(row.overdue, 150);
    assert.equal(row.overdueCount, 1);
    assert.equal(row.oldestOverdue, '2026-09-25T20:59:59.000Z');
    assert.equal(row.state, 'overdue');
    assert.equal(row.feeCount, 3);
    // „Scadent …” on the row: the earliest due date of any fee, as the client read it from fees.
    assert.equal(row.oldestDueDate, '2026-09-25T20:59:59.000Z');
});

test('a player who owes nothing has no due date and no fees', () => {
    const row = summarizeBalance({ ...balance, fees: [], ...summarizeFees([]) });
    assert.equal(row.feeCount, 0);
    assert.equal(row.oldestDueDate, null);
    assert.equal(row.state, 'paid');
});

test('rows sort by overdue, then owed, then name', () => {
    const rows = [
        { playerName: 'B', overdue: 0, outstanding: 10 },
        { playerName: 'A', overdue: 0, outstanding: 10 },
        { playerName: 'C', overdue: 50, outstanding: 50 },
        { playerName: 'D', overdue: 0, outstanding: 90 },
    ].sort(compareBalances);
    assert.deepEqual(rows.map((row) => row.playerName), ['C', 'D', 'A', 'B']);
});
