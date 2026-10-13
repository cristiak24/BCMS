import test from 'node:test';
import assert from 'node:assert/strict';
import {
    billingAmount,
    billingForMonth,
    isMonthKey,
    monthlyTrend,
    monthsBack,
    summarizeClubs,
    type MetricActivity,
    type MetricClub,
    type MetricUser,
} from './platformMetrics';
import { activityKeys, shouldRecord } from './activityTracker';

const club = (id: number, price: number | null = null): MetricClub => ({
    id,
    name: `Club ${id}`,
    createdAt: '2026-01-01 00:00:00',
    stripeAccountId: null,
    stripeChargesEnabled: false,
    billingPricePerUser: price,
    internalNotes: null,
});

const activity = (userId: number, clubId: number | null, role: string, month = '2026-10'): MetricActivity => ({
    userId,
    clubId,
    role,
    month,
    activeDays: 1,
    lastSeenAt: `${month}-05 10:00:00`,
});

test('monthsBack crosses year boundaries, oldest first', () => {
    assert.deepEqual(monthsBack('2026-02', 4), ['2025-11', '2025-12', '2026-01', '2026-02']);
});

test('isMonthKey accepts only YYYY-MM', () => {
    assert.equal(isMonthKey('2026-10'), true);
    assert.equal(isMonthKey('2026-13'), false);
    assert.equal(isMonthKey('2026-1'), false);
    assert.equal(isMonthKey(undefined), false);
});

test('billing counts each account once per club and month, never superadmins or clubless accounts', () => {
    const rows = billingForMonth([club(1, 5), club(2)], [
        activity(10, 1, 'coach'),
        activity(10, 1, 'coach'), // duplicate must not double-bill
        activity(11, 1, 'parent'),
        activity(12, 1, 'superadmin'),
        activity(13, null, 'player'),
        activity(14, 2, 'player'),
        activity(15, 1, 'player', '2026-09'), // other month
    ], '2026-10');

    assert.equal(rows[0].billableUsers, 2);
    assert.equal(rows[0].byRole.coach, 1);
    assert.equal(rows[0].byRole.parent, 1);
    assert.equal(rows[0].amount, 10);
    assert.equal(rows[1].billableUsers, 1);
    assert.equal(rows[1].amount, null, 'an unpriced club has no amount, not 0');
});

test('billingAmount rounds to bani', () => {
    assert.equal(billingAmount(0.1, 3), 0.3);
    assert.equal(billingAmount(12.5, 7), 87.5);
    assert.equal(billingAmount(null, 3), null);
});

test('club summary flags clubs without an admin and dormant clubs', () => {
    const now = Date.parse('2026-10-12T12:00:00Z');
    const users: MetricUser[] = [
        { id: 1, clubId: 1, role: 'admin', status: 'active', lastLoginAt: '2026-10-11 09:00:00', createdAt: '2026-01-01 00:00:00' },
        { id: 2, clubId: 1, role: 'player', status: 'disabled', lastLoginAt: '2026-10-11 09:00:00', createdAt: '2026-01-01 00:00:00' },
        { id: 3, clubId: 2, role: 'coach', status: 'active', lastLoginAt: '2026-07-01 09:00:00', createdAt: '2026-01-01 00:00:00' },
        { id: 4, clubId: 2, role: 'superadmin', status: 'active', lastLoginAt: '2026-10-11 09:00:00', createdAt: '2026-01-01 00:00:00' },
    ];
    const [first, second] = summarizeClubs({
        clubs: [club(1), club(2)],
        users,
        activity: [],
        month: '2026-10',
        teamsByClub: new Map(),
        playersByClub: new Map(),
        pendingInvitesByClub: new Map(),
        now,
    });

    assert.equal(first.flags.noAdmin, false);
    assert.equal(first.active30d, 1, 'disabled accounts are not active');
    assert.equal(first.accounts.disabled, 1);
    assert.equal(second.flags.noAdmin, true);
    assert.equal(second.flags.dormant, true);
    assert.equal(second.accounts.total, 1, 'superadmins are not club members');
});

test('monthly trend sums billable users and priced amounts per month', () => {
    const trend = monthlyTrend({
        clubs: [club(1, 2), club(2)],
        users: [{ createdAt: '2026-10-02 00:00:00', clubId: 1, role: 'player' }],
        activity: [activity(1, 1, 'player'), activity(2, 2, 'player'), activity(1, 1, 'player', '2026-09')],
        months: ['2026-09', '2026-10'],
    });
    assert.deepEqual(trend.map((point) => point.activeUsers), [1, 2]);
    assert.deepEqual(trend.map((point) => point.amount), [2, 2]);
    assert.deepEqual(trend.map((point) => point.newAccounts), [0, 1]);
});

test('activity months follow Romanian time, not UTC', () => {
    // 22:30 UTC on 31 Oct is already 1 Nov in Bucharest (UTC+2 in winter).
    assert.deepEqual(activityKeys(new Date('2026-10-31T22:30:00Z')), { day: '2026-11-01', month: '2026-11' });
});

test('activity writes are throttled within a day but not across days', () => {
    const now = Date.parse('2026-10-12T10:00:00Z');
    assert.equal(shouldRecord(undefined, now, '2026-10-12'), true);
    assert.equal(shouldRecord({ at: now - 60_000, day: '2026-10-12' }, now, '2026-10-12'), false);
    assert.equal(shouldRecord({ at: now - 11 * 60_000, day: '2026-10-12' }, now, '2026-10-12'), true);
    assert.equal(shouldRecord({ at: now - 60_000, day: '2026-10-11' }, now, '2026-10-12'), true);
});
