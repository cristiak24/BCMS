import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyRosterQuery, parseRosterQuery, type RosterRowLike } from './rosterQuery';

const row = (id: number, firstName: string, team: string | null, extra: Partial<RosterRowLike> = {}): RosterRowLike => ({
    id, firstName, lastName: 'Pop', number: id, status: 'active',
    category: team ?? 'Unassigned', teamName: team ?? 'Unassigned', teamNames: team ? [team] : [], isUnassigned: !team,
    attendanceRate: 80, paymentStatus: 'paid', ...extra,
});

const rows = [
    row(1, 'Ana', 'U12', { attendanceRate: 95, paymentStatus: 'overdue' }),
    row(2, 'Radu', 'U14', { attendanceRate: 70, paymentStatus: 'pending' }),
    row(3, 'Ștefan', 'U12', { status: 'inactive' }),
    row(4, 'Luca', null, { attendanceRate: 88 }),
    row(5, 'Matei', 'U14', { attendanceRate: 91, paymentStatus: 'processed' }),
];

const query = (params: Record<string, unknown>) => parseRosterQuery({ page: '1', pageSize: '12', ...params })!;

test('without ?page the caller keeps the plain list', () => {
    assert.equal(parseRosterQuery({}), null);
});

test('pages hold pageSize rows and report the totals of the filter and of the roster', () => {
    const page2 = applyRosterQuery(rows, { ...query({}), pageSize: 2, page: 2 });
    assert.deepEqual(page2.items.map((r) => r.id), [3, 4]);
    assert.equal(page2.total, 5);
    assert.equal(page2.totalPages, 3);
    assert.equal(page2.rosterTotal, 5);
});

test('a page past the end answers the last page', () => {
    const result = applyRosterQuery(rows, { ...query({}), pageSize: 2, page: 9 });
    assert.equal(result.page, 3);
    assert.deepEqual(result.items.map((r) => r.id), [5]);
});

test('only the page sizes Lot offers are accepted; "all" is for the export', () => {
    assert.equal(query({ pageSize: '48' }).pageSize, 48);
    assert.equal(query({ pageSize: '5000' }).pageSize, 12);
    assert.equal(query({ pageSize: 'all' }).pageSize, null);
    assert.equal(applyRosterQuery(rows, query({ pageSize: 'all' })).items.length, 5);
});

test('search covers name, shirt number, team, category and payment label', () => {
    const ids = (q: string) => applyRosterQuery(rows, query({ q })).items.map((r) => r.id);
    assert.deepEqual(ids('ana pop'), [1]);
    assert.deepEqual(ids('u14'), [2, 5]);
    assert.deepEqual(ids('restanță'), [1]);
    assert.deepEqual(ids('neasignat'), [4]);
    assert.deepEqual(ids('3'), [3]);
});

test('filters: team, unassigned, status, attendance band and payment bucket', () => {
    const ids = (params: Record<string, unknown>) => applyRosterQuery(rows, query(params)).items.map((r) => r.id);
    assert.deepEqual(ids({ team: 'U12' }), [1, 3]);
    assert.deepEqual(ids({ team: '__unassigned__' }), [4]);
    assert.deepEqual(ids({ status: 'active' }), [1, 2, 4, 5]);
    assert.deepEqual(ids({ status: 'inactive' }), [3]);
    assert.deepEqual(ids({ attendance: 'high' }), [1, 5]);
    assert.deepEqual(ids({ attendance: 'medium' }), [3, 4]);
    assert.deepEqual(ids({ attendance: 'low' }), [2]);
    assert.deepEqual(ids({ payment: 'paid' }), [3, 4, 5]);
    assert.deepEqual(ids({ payment: 'pending' }), [2]);
});

test('sorting by name (Romanian order), attendance and payment, both ways; ties keep roster order', () => {
    const ids = (params: Record<string, unknown>) => applyRosterQuery(rows, query(params)).items.map((r) => r.id);
    assert.deepEqual(ids({ sort: 'name' }), [1, 4, 5, 2, 3]);
    assert.deepEqual(ids({ sort: 'attendance', dir: 'desc' }), [1, 5, 4, 3, 2]);
    assert.deepEqual(ids({ sort: 'payment' }), [3, 4, 5, 2, 1]);
});

test('the team filter lists the roster\'s teams whatever the current filter', () => {
    const result = applyRosterQuery(rows, query({ team: 'U12' }));
    assert.deepEqual(result.teams, ['U12', 'U14']);
    assert.equal(result.hasUnassigned, true);
});

test('sorting by visa puts no visa first, then the earliest expiry', () => {
    const visas = [
        row(1, 'Ana', 'U12', { medicalCheckExpiry: '2026-12-01T00:00:00.000Z' }),
        row(2, 'Radu', 'U12', { medicalCheckExpiry: null }),
        row(3, 'Ioana', 'U12', { medicalCheckExpiry: '2026-09-01T00:00:00.000Z' }),
        row(4, 'Luca', 'U12', { medicalCheckExpiry: null }),
    ];
    const asc = applyRosterQuery(visas, query({ sort: 'medical', dir: 'asc' }));
    assert.deepEqual(asc.items.map((r) => r.id).slice(2), [3, 1]);
    assert.deepEqual(asc.items.slice(0, 2).map((r) => r.id).sort(), [2, 4]);
    const desc = applyRosterQuery(visas, query({ sort: 'medical', dir: 'desc' }));
    assert.deepEqual(desc.items.map((r) => r.id).slice(0, 2), [1, 3]);
});
