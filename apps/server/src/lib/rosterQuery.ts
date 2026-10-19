/**
 * Lot, one page at a time (audit P2: the whole club's roster, ~160 KB, on
 * every visit). The search, filters and sort the screen used to apply in the
 * browser run here, with the same rules as
 * apps/client/components/roster/rosterHelpers.ts — keep the two in step.
 * Pure, see rosterQuery.test.ts.
 */

export type RosterRowLike = {
    id: number;
    firstName: string;
    lastName: string;
    number: number | null;
    status: string | null;
    category?: string;
    attendanceRate?: number | null;
    paymentStatus?: string;
    teamName?: string;
    teamNames?: string[];
    isUnassigned?: boolean;
    position?: string | null;
};

export const UNASSIGNED_TEAM_FILTER = '__unassigned__';
export const ROSTER_PAGE_SIZES = [12, 24, 48, 100];

export type RosterQuery = {
    q: string;
    team: string;
    status: 'active' | 'inactive' | 'all';
    attendance: 'all' | 'high' | 'medium' | 'low';
    payment: 'all' | 'paid' | 'pending' | 'overdue';
    sort: 'name' | 'attendance' | 'payment' | null;
    dir: 'asc' | 'desc';
    page: number;
    /** null = every matching row (CSV export). */
    pageSize: number | null;
};

const UNASSIGNED_LABEL = 'Neasignat';

export function categoryLabel(row: RosterRowLike) {
    return row.isUnassigned || !row.category || row.category === 'Unassigned' ? UNASSIGNED_LABEL : row.category;
}

export function attendanceRateOf(row: RosterRowLike) {
    if (typeof row.attendanceRate !== 'number') return 0;
    return Math.max(0, Math.min(Math.round(row.attendanceRate), 100));
}

export function paymentBucket(status?: string | null): 'paid' | 'pending' | 'overdue' {
    const normalized = (status || '').trim().toLowerCase();
    if (normalized === 'paid' || normalized === 'processed') return 'paid';
    if (normalized === 'overdue') return 'overdue';
    return 'pending';
}

function paymentLabel(status?: string | null) {
    const bucket = paymentBucket(status);
    return bucket === 'paid' ? 'Plătit' : bucket === 'overdue' ? 'Restanță' : 'În așteptare';
}

function paymentRank(status?: string | null) {
    const bucket = paymentBucket(status);
    return bucket === 'paid' ? 0 : bucket === 'pending' ? 1 : 2;
}

export function teamLabel(row: RosterRowLike) {
    if (row.isUnassigned) return UNASSIGNED_LABEL;
    const name = row.teamName || row.teamNames?.[0];
    return !name || name === 'Unassigned' ? UNASSIGNED_LABEL : name;
}

function isUnassigned(row: RosterRowLike) {
    return row.isUnassigned === true
        || (!row.teamName && (!row.teamNames || row.teamNames.length === 0))
        || teamLabel(row) === UNASSIGNED_LABEL;
}

function isActive(row: RosterRowLike) {
    return (row.status || 'active').trim().toLowerCase() !== 'inactive';
}

function matchesAttendance(rate: number, filter: RosterQuery['attendance']) {
    if (filter === 'all') return true;
    if (filter === 'high') return rate >= 90;
    if (filter === 'medium') return rate >= 75 && rate < 90;
    return rate < 75;
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
    return typeof value === 'string' && (allowed as readonly string[]).includes(value) ? value as T : fallback;
}

/** The roster query from the URL, or null when the caller wants the plain list (no `page`). */
export function parseRosterQuery(query: Record<string, unknown>): RosterQuery | null {
    if (query.page == null) return null;
    const page = Math.max(1, Math.floor(Number(query.page)) || 1);
    const size = Number(query.pageSize);
    return {
        q: typeof query.q === 'string' ? query.q.slice(0, 120) : '',
        team: typeof query.team === 'string' && query.team ? query.team.slice(0, 255) : 'all',
        status: oneOf(query.status, ['active', 'inactive', 'all'] as const, 'all'),
        attendance: oneOf(query.attendance, ['all', 'high', 'medium', 'low'] as const, 'all'),
        payment: oneOf(query.payment, ['all', 'paid', 'pending', 'overdue'] as const, 'all'),
        sort: query.sort === 'name' || query.sort === 'attendance' || query.sort === 'payment' ? query.sort : null,
        dir: query.dir === 'desc' ? 'desc' : 'asc',
        page,
        pageSize: query.pageSize === 'all' ? null : ROSTER_PAGE_SIZES.includes(size) ? size : ROSTER_PAGE_SIZES[0],
    };
}

export function applyRosterQuery<T extends RosterRowLike>(rows: T[], query: RosterQuery) {
    const q = query.q.toLowerCase().trim();
    const filtered = rows.filter((row) => {
        const fullName = `${row.firstName} ${row.lastName}`.toLowerCase();
        const matchesSearch = !q || [
            fullName,
            String(row.number || '').toLowerCase(),
            (row.position || '').toLowerCase(),
            categoryLabel(row).toLowerCase(),
            paymentLabel(row.paymentStatus).toLowerCase(),
            teamLabel(row).toLowerCase(),
        ].some((value) => value.includes(q));
        const matchesTeam = query.team === 'all'
            || (query.team === UNASSIGNED_TEAM_FILTER ? isUnassigned(row) : teamLabel(row) === query.team);
        const matchesStatus = query.status === 'all' || isActive(row) === (query.status === 'active');
        const matchesPayment = query.payment === 'all' || paymentBucket(row.paymentStatus) === query.payment;
        return matchesSearch && matchesTeam && matchesStatus && matchesAttendance(attendanceRateOf(row), query.attendance) && matchesPayment;
    });

    const sorted = query.sort
        ? [...filtered].sort((a, b) => {
            let result = 0;
            if (query.sort === 'name') result = `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`, 'ro');
            else if (query.sort === 'attendance') result = attendanceRateOf(a) - attendanceRateOf(b);
            else result = paymentRank(a.paymentStatus) - paymentRank(b.paymentStatus);
            return query.dir === 'asc' ? result : -result;
        })
        : filtered;

    const pageSize = query.pageSize ?? Math.max(1, sorted.length);
    const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
    const page = Math.min(query.page, totalPages);
    const start = (page - 1) * pageSize;

    return {
        items: sorted.slice(start, start + pageSize),
        total: sorted.length,
        page,
        pageSize: query.pageSize,
        totalPages,
        /** The whole roster, unfiltered: the screen's header counts and team filter. */
        rosterTotal: rows.length,
        teams: Array.from(new Set(rows.map(teamLabel).filter((label) => label !== UNASSIGNED_LABEL))).sort((a, b) => a.localeCompare(b, 'ro')),
        hasUnassigned: rows.some(isUnassigned),
    };
}
