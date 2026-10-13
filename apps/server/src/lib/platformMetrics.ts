/**
 * Pure numbers behind the super admin console (routes/superAdmin.ts): club
 * summaries, platform overview and monthly billing. Kept free of the database
 * so the billing rules are unit-tested (platformMetrics.test.ts).
 *
 * Billing rule: a club is billed for every account that used the app at least
 * once in the month (a user_activity_months row) while belonging to that club.
 * Super admins and accounts without a club are never billable.
 */

export const CLUB_ROLES = ['admin', 'coach', 'accountant', 'staff', 'player', 'parent'] as const;
export type ClubRole = (typeof CLUB_ROLES)[number];
export type RoleCounts = Record<ClubRole, number>;

export type MetricUser = {
    id: number;
    clubId: number | null;
    role: string;
    status: string;
    lastLoginAt: string | null;
    createdAt: string;
};

export type MetricActivity = {
    userId: number;
    clubId: number | null;
    role: string | null;
    month: string;
    activeDays: number;
    lastSeenAt: string;
};

export type MetricClub = {
    id: number;
    name: string;
    createdAt: string;
    stripeAccountId: string | null;
    stripeChargesEnabled: boolean;
    billingPricePerUser: number | null;
    internalNotes: string | null;
};

const DAY_MS = 24 * 60 * 60 * 1000;

export function emptyRoleCounts(): RoleCounts {
    return { admin: 0, coach: 0, accountant: 0, staff: 0, player: 0, parent: 0 };
}

function addRole(counts: RoleCounts, role: string | null) {
    if (role && (CLUB_ROLES as readonly string[]).includes(role)) {
        counts[role as ClubRole] += 1;
    }
}

/** `count` month keys ending at `month` (inclusive), oldest first. */
export function monthsBack(month: string, count: number): string[] {
    const [year, mon] = month.split('-').map(Number);
    const keys: string[] = [];
    for (let offset = count - 1; offset >= 0; offset -= 1) {
        const date = new Date(Date.UTC(year, mon - 1 - offset, 1));
        keys.push(`${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`);
    }
    return keys;
}

export function isMonthKey(value: unknown): value is string {
    return typeof value === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
}

export function isBillableActivity(row: Pick<MetricActivity, 'clubId' | 'role'>) {
    return row.clubId != null && row.role !== 'superadmin';
}

/** Price × billable users, rounded to bani; null while the club has no price. */
export function billingAmount(price: number | null, billableUsers: number) {
    if (price == null || !Number.isFinite(price)) return null;
    return Math.round(price * billableUsers * 100) / 100;
}

function parseTime(value: string | null | undefined) {
    if (!value) return null;
    // Timestamps without a zone are stored UTC (see signup-invite-codes notes).
    const time = Date.parse(/[zZ]|[+-]\d\d:?\d\d$/.test(value) ? value : `${value.replace(' ', 'T')}Z`);
    return Number.isNaN(time) ? null : time;
}

/** A stored timestamp as an ISO string with its zone, for the browser. */
export function utcIso(value: string | null | undefined) {
    const time = parseTime(value);
    return time == null ? null : new Date(time).toISOString();
}

export function activeWithin(user: Pick<MetricUser, 'lastLoginAt'>, days: number, now: number) {
    const time = parseTime(user.lastLoginAt);
    return time != null && now - time <= days * DAY_MS;
}

export type ClubBilling = {
    clubId: number;
    name: string;
    pricePerUser: number | null;
    billableUsers: number;
    byRole: RoleCounts;
    amount: number | null;
};

/** Per-club billing for one month, from that month's activity rows. */
export function billingForMonth(clubs: MetricClub[], activity: MetricActivity[], month: string): ClubBilling[] {
    const byClub = new Map<number, { users: Set<number>; byRole: RoleCounts }>();
    for (const row of activity) {
        if (row.month !== month || !isBillableActivity(row)) continue;
        const entry = byClub.get(row.clubId!) ?? { users: new Set<number>(), byRole: emptyRoleCounts() };
        if (!entry.users.has(row.userId)) {
            entry.users.add(row.userId);
            addRole(entry.byRole, row.role);
        }
        byClub.set(row.clubId!, entry);
    }

    return clubs.map((club) => {
        const entry = byClub.get(club.id);
        const billableUsers = entry?.users.size ?? 0;
        return {
            clubId: club.id,
            name: club.name,
            pricePerUser: club.billingPricePerUser,
            billableUsers,
            byRole: entry?.byRole ?? emptyRoleCounts(),
            amount: billingAmount(club.billingPricePerUser, billableUsers),
        };
    });
}

export type ClubSummary = {
    id: number;
    name: string;
    createdAt: string;
    stripeConnected: boolean;
    billingPricePerUser: number | null;
    internalNotes: string | null;
    accounts: { total: number; active: number; pending: number; disabled: number };
    roles: RoleCounts;
    teams: number;
    rosterPlayers: number;
    pendingInvites: number;
    activeThisMonth: number;
    active30d: number;
    lastActivityAt: string | null;
    estimatedAmount: number | null;
    flags: { noAdmin: boolean; dormant: boolean; unpriced: boolean };
};

export function summarizeClubs(input: {
    clubs: MetricClub[];
    users: MetricUser[];
    activity: MetricActivity[];
    month: string;
    teamsByClub: Map<number, number>;
    playersByClub: Map<number, number>;
    pendingInvitesByClub: Map<number, number>;
    now: number;
}): ClubSummary[] {
    const billing = new Map(billingForMonth(input.clubs, input.activity, input.month).map((row) => [row.clubId, row]));

    return input.clubs.map((club) => {
        const members = input.users.filter((user) => user.clubId === club.id && user.role !== 'superadmin');
        const roles = emptyRoleCounts();
        let lastActivity: number | null = null;
        let lastActivityAt: string | null = null;
        for (const member of members) {
            if (member.status !== 'disabled') addRole(roles, member.role);
            const time = parseTime(member.lastLoginAt);
            if (time != null && (lastActivity == null || time > lastActivity)) {
                lastActivity = time;
                lastActivityAt = member.lastLoginAt;
            }
        }
        const bill = billing.get(club.id);
        const active30d = members.filter((member) => member.status !== 'disabled' && activeWithin(member, 30, input.now)).length;
        const accounts = {
            total: members.length,
            active: members.filter((member) => member.status === 'active').length,
            pending: members.filter((member) => member.status === 'pending').length,
            disabled: members.filter((member) => member.status === 'disabled').length,
        };

        return {
            id: club.id,
            name: club.name,
            createdAt: utcIso(club.createdAt) ?? club.createdAt,
            stripeConnected: Boolean(club.stripeAccountId && club.stripeChargesEnabled),
            billingPricePerUser: club.billingPricePerUser,
            internalNotes: club.internalNotes,
            accounts,
            roles,
            teams: input.teamsByClub.get(club.id) ?? 0,
            rosterPlayers: input.playersByClub.get(club.id) ?? 0,
            pendingInvites: input.pendingInvitesByClub.get(club.id) ?? 0,
            activeThisMonth: bill?.billableUsers ?? 0,
            active30d,
            lastActivityAt: utcIso(lastActivityAt),
            estimatedAmount: bill?.amount ?? null,
            flags: {
                noAdmin: roles.admin === 0,
                // Has accounts, yet nobody opened the app for a month.
                dormant: accounts.total > 0 && active30d === 0,
                unpriced: club.billingPricePerUser == null,
            },
        };
    });
}

export type TrendPoint = { month: string; activeUsers: number; newAccounts: number; amount: number | null };

/** Billable users, new accounts and invoiced total per month (oldest first). */
export function monthlyTrend(input: {
    clubs: MetricClub[];
    users: Pick<MetricUser, 'createdAt' | 'clubId' | 'role'>[];
    activity: MetricActivity[];
    months: string[];
    clubId?: number;
}): TrendPoint[] {
    const clubs = input.clubId == null ? input.clubs : input.clubs.filter((club) => club.id === input.clubId);
    return input.months.map((month) => {
        const rows = billingForMonth(clubs, input.activity, month);
        const priced = rows.filter((row) => row.amount != null);
        const newAccounts = input.users.filter((user) => {
            if (user.role === 'superadmin') return false;
            if (input.clubId != null && user.clubId !== input.clubId) return false;
            return String(user.createdAt).slice(0, 7) === month;
        }).length;
        return {
            month,
            activeUsers: rows.reduce((sum, row) => sum + row.billableUsers, 0),
            newAccounts,
            amount: priced.length ? Math.round(priced.reduce((sum, row) => sum + (row.amount ?? 0), 0) * 100) / 100 : null,
        };
    });
}
