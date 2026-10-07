/**
 * What a player owes — one pure calculation used by every screen (the
 * player's Plăți page, the club's balances, team stats, the dashboard), so
 * the numbers cannot disagree. See feeSchedule.test.ts.
 *
 * Recurring fees (monthly fee, training levy, facility fee) are owed for each
 * month of the club's billing window: from `billingStartMonth` (set by the
 * admin in Finanțe) — but never before the player joined — up to the current
 * month. Without a start month only the current month is billed, which is how
 * the app behaved before: a club that kept its arrears elsewhere must not wake
 * up to years of debt it never recorded here.
 *
 * Every fee is due on `paymentDueDay` of the month after it (October's fee is
 * due on 25 November with the default). Past that date it is overdue.
 */
import { collectPaidFeeIds, isOutstandingStatus, monthKey } from './paymentLedger';

export const MAX_BILLED_MONTHS = 24;

export type FeeSettings = {
    monthlyPlayerFee: number;
    trainingLevy: number;
    facilityFee: number;
    paymentDueDay: number;
    billingStartMonth: string | null;
};

export type LedgerRow = {
    id: number;
    status: string | null;
    feeIds?: string | null;
    month: number | null;
    year: number | null;
    amount: number | null;
    description?: string | null;
    date?: string | null;
    createdAt?: string | null;
};

export type FeeEvent = {
    id: number;
    title: string | null;
    description?: string | null;
    amount: number | null;
    status: string | null;
    type: string | null;
    startTime: string | null;
};

export type FeeStatus = 'overdue' | 'pending' | 'upcoming';

export type ComputedFee = {
    id: string;
    kind: 'monthly' | 'levy' | 'facility' | 'event' | 'request';
    label: string;
    description: string;
    amount: number;
    status: FeeStatus;
    dueDate: string | null;
    icon: 'training' | 'trophy' | 'receipt';
    paymentId?: number | null;
};

export type FeeInput = {
    settings: FeeSettings;
    rows: LedgerRow[];
    /** Events of the player's teams. */
    events: FeeEvent[];
    /** Past fee events the player attended (present/late) — only those are owed afterwards. */
    attendedEventIds: Set<number>;
    /** When the player record was created; months before it are never billed. */
    playerSince: string | null;
    now: Date;
    /**
     * False for an inactive player: they left, so no recurring month is billed
     * (the date they left isn't recorded). Club request rows and event fees
     * they took part in still count.
     */
    billRecurring?: boolean;
};

const UPCOMING_EVENT_LIMIT = 6;

function positive(value: unknown) {
    const amount = Number(value ?? 0);
    return Number.isFinite(amount) && amount > 0 ? amount : 0;
}

function parseMonth(value: string | null | undefined): { year: number; month: number } | null {
    const match = /^(\d{4})-(\d{2})$/.exec(String(value ?? '').trim());
    if (!match) return null;
    const year = Number(match[1]);
    const month = Number(match[2]);
    return month >= 1 && month <= 12 ? { year, month } : null;
}

export function isValidBillingMonth(value: unknown) {
    return parseMonth(typeof value === 'string' ? value : null) != null;
}

function monthIndex(year: number, month: number) {
    return year * 12 + (month - 1);
}

function fromIndex(index: number) {
    return { year: Math.floor(index / 12), month: (index % 12) + 1 };
}

/** `dueDay` of the month after (year, month), clamped to that month's length. */
export function dueDateFor(year: number, month: number, dueDay: number) {
    const daysInNext = new Date(year, month + 1, 0).getDate();
    const day = Math.min(Math.max(1, Math.trunc(dueDay) || 1), daysInNext);
    return new Date(year, month, day, 23, 59, 59);
}

function monthLabel(year: number, month: number) {
    return new Intl.DateTimeFormat('ro-RO', { month: 'long', year: 'numeric' }).format(new Date(year, month - 1, 1));
}

/** Months billed for this player, oldest first. */
export function billedMonths(settings: FeeSettings, playerSince: string | null, now: Date) {
    const current = monthIndex(now.getFullYear(), now.getMonth() + 1);
    const start = parseMonth(settings.billingStartMonth);
    if (!start) return [fromIndex(current)];

    let first = monthIndex(start.year, start.month);
    const since = playerSince ? new Date(playerSince) : null;
    if (since && !Number.isNaN(since.getTime())) {
        first = Math.max(first, monthIndex(since.getFullYear(), since.getMonth() + 1));
    }
    first = Math.max(first, current - (MAX_BILLED_MONTHS - 1));
    if (first > current) return [fromIndex(current)];

    const months = [];
    for (let index = first; index <= current; index += 1) months.push(fromIndex(index));
    return months;
}

export function computePlayerFees(input: FeeInput): ComputedFee[] {
    const { settings, rows, events, attendedEventIds, now } = input;
    const paid = collectPaidFeeIds(rows);
    const nowTs = now.getTime();
    const currentIndex = monthIndex(now.getFullYear(), now.getMonth() + 1);
    const statusFor = (due: Date, year: number, month: number): FeeStatus => {
        if (due.getTime() < nowTs) return 'overdue';
        return monthIndex(year, month) === currentIndex ? 'upcoming' : 'pending';
    };

    const fees: ComputedFee[] = [];

    // Request rows the club raised by hand (legacy "pending" rows) that no
    // payment settled yet. One raised for a month stands for that month's fee.
    const requests = rows.filter((row) => isOutstandingStatus(row.status) && !paid.has(`payment:${row.id}`) && positive(row.amount) > 0);
    const requestMonths = new Set(requests.filter((row) => row.month && row.year).map((row) => monthKey(row.year!, row.month!)));
    for (const row of requests) {
        const due = row.month && row.year ? dueDateFor(row.year, row.month, settings.paymentDueDay) : null;
        fees.push({
            id: `payment:${row.id}`,
            kind: 'request',
            label: row.description || (row.month && row.year ? `Cotizație ${monthLabel(row.year, row.month)}` : 'Cerere de plată'),
            description: 'Cerere de plată de la club',
            amount: positive(row.amount),
            status: due ? statusFor(due, row.year!, row.month!) : 'pending',
            dueDate: due ? due.toISOString() : row.date ?? row.createdAt ?? null,
            icon: 'training',
            paymentId: row.id,
        });
    }

    const recurring: Array<{ kind: ComputedFee['kind']; amount: number; label: string; description: string; icon: ComputedFee['icon'] }> = [
        { kind: 'monthly', amount: positive(settings.monthlyPlayerFee), label: 'Cotizație', description: 'Cotizație lunară', icon: 'training' },
        { kind: 'levy', amount: positive(settings.trainingLevy), label: 'Contribuție antrenament', description: 'Contribuție lunară pentru pregătire', icon: 'receipt' },
        { kind: 'facility', amount: positive(settings.facilityFee), label: 'Taxă bază sportivă', description: 'Contribuție pentru sală și teren', icon: 'receipt' },
    ];

    const months = input.billRecurring === false ? [] : billedMonths(settings, input.playerSince, now);
    for (const { year, month } of months) {
        const key = monthKey(year, month);
        const due = dueDateFor(year, month, settings.paymentDueDay);
        for (const fee of recurring) {
            if (!fee.amount) continue;
            const id = `${fee.kind}:${key}`;
            if (paid.has(id)) continue;
            if (fee.kind === 'monthly' && requestMonths.has(key)) continue;
            fees.push({
                id,
                kind: fee.kind,
                label: `${fee.label} ${monthLabel(year, month)}`,
                description: fee.description,
                amount: fee.amount,
                status: statusFor(due, year, month),
                dueDate: due.toISOString(),
                icon: fee.icon,
            });
        }
    }

    // Event fees: upcoming ones for the whole squad; a past one stays owed
    // only by players who took part, and only inside the billing window.
    const windowStart = (() => {
        const start = parseMonth(settings.billingStartMonth);
        return start ? new Date(start.year, start.month - 1, 1).getTime() : null;
    })();
    const eventFees = events
        .filter((event) => positive(event.amount) > 0 && String(event.status ?? '').toLowerCase() !== 'cancelled' && !paid.has(`event:${event.id}`))
        .map((event) => ({ event, start: event.startTime ? new Date(event.startTime).getTime() : NaN }))
        .filter(({ start }) => Number.isFinite(start));
    const upcoming = eventFees
        .filter(({ start }) => start >= nowTs)
        .sort((a, b) => a.start - b.start)
        .slice(0, UPCOMING_EVENT_LIMIT);
    const past = windowStart == null
        ? []
        : eventFees.filter(({ event, start }) => start < nowTs && start >= windowStart && attendedEventIds.has(event.id));
    for (const { event, start } of [...past, ...upcoming]) {
        fees.push({
            id: `event:${event.id}`,
            kind: 'event',
            label: event.title || 'Taxă eveniment',
            description: event.description || 'Taxă de participare la eveniment',
            amount: positive(event.amount),
            status: start < nowTs ? 'overdue' : 'upcoming',
            dueDate: new Date(start).toISOString(),
            icon: event.type === 'match' ? 'trophy' : 'receipt',
        });
    }

    const rank: Record<FeeStatus, number> = { overdue: 0, pending: 1, upcoming: 2 };
    return fees.sort((a, b) => (
        rank[a.status] - rank[b.status]
        || (a.dueDate ? Date.parse(a.dueDate) : 0) - (b.dueDate ? Date.parse(b.dueDate) : 0)
    ));
}

export type FeeTotals = {
    outstanding: number;
    overdue: number;
    overdueCount: number;
    oldestOverdue: string | null;
    /** 'overdue' if anything is past due, 'due' if something is owed, else 'paid'. */
    state: 'overdue' | 'due' | 'paid';
};

export function summarizeFees(fees: ComputedFee[]): FeeTotals {
    const overdueFees = fees.filter((fee) => fee.status === 'overdue');
    const outstanding = fees.reduce((sum, fee) => sum + fee.amount, 0);
    const overdue = overdueFees.reduce((sum, fee) => sum + fee.amount, 0);
    const oldest = overdueFees
        .map((fee) => fee.dueDate)
        .filter((date): date is string => Boolean(date))
        .sort()[0] ?? null;
    return {
        outstanding,
        overdue,
        overdueCount: overdueFees.length,
        oldestOverdue: oldest,
        state: overdueFees.length ? 'overdue' : outstanding > 0 ? 'due' : 'paid',
    };
}
