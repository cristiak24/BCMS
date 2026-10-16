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
 * due on 25 November with the default), at the end of that day in Romania.
 * Past that moment it is overdue. Months and due dates are Romanian calendar
 * dates whatever time zone the server runs in (Render: UTC).
 *
 * Payments are applied by amount: a fee shows what is still owed on it
 * (`amount`) and what was already paid towards it (`paidAmount`). Money paid
 * beyond every fee is an advance (`credit`) that covers the oldest fees owed.
 * planPayment() decides how a new desk payment is split, and the same split
 * is shown to the admin before saving.
 */
import { clubDateTime, clubMonth, daysInMonth } from './clubTime';
import { roundMoney } from './money';
import { allocationToken, collectSettlements, CREDIT_TOKEN, isOutstandingStatus, monthKey } from './paymentLedger';

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
    /** Still owed on this fee. */
    amount: number;
    /** Already paid towards it (partial payments, advance); absent when nothing was. */
    paidAmount?: number;
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

function currentMonthIndex(now: Date) {
    const { year, month } = clubMonth(now);
    return monthIndex(year, month);
}

/**
 * End (23:59:59, Romanian time) of day `dueDay` of the month after (year,
 * month), clamped to that month's length.
 */
export function dueDateFor(year: number, month: number, dueDay: number) {
    const next = fromIndex(monthIndex(year, month) + 1);
    const day = Math.min(Math.max(1, Math.trunc(dueDay) || 1), daysInMonth(next.year, next.month));
    return clubDateTime(next.year, next.month, day, 23, 59, 59);
}

function monthLabel(year: number, month: number) {
    return new Intl.DateTimeFormat('ro-RO', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(year, month - 1, 15)));
}

/** Months billed for this player, oldest first. */
export function billedMonths(settings: FeeSettings, playerSince: string | null, now: Date) {
    const current = currentMonthIndex(now);
    const start = parseMonth(settings.billingStartMonth);
    if (!start) return [fromIndex(current)];

    let first = monthIndex(start.year, start.month);
    const since = playerSince ? new Date(playerSince) : null;
    if (since && !Number.isNaN(since.getTime())) {
        const joined = clubMonth(since);
        first = Math.max(first, monthIndex(joined.year, joined.month));
    }
    first = Math.max(first, current - (MAX_BILLED_MONTHS - 1));
    if (first > current) return [fromIndex(current)];

    const months = [];
    for (let index = first; index <= current; index += 1) months.push(fromIndex(index));
    return months;
}

/**
 * Oldest first: by due date, fees without one last. The sort is stable, so
 * fees due together keep the order they were listed in (cotizație first).
 */
function byDueDate(a: ComputedFee, b: ComputedFee) {
    const at = a.dueDate ? Date.parse(a.dueDate) : Number.POSITIVE_INFINITY;
    const bt = b.dueDate ? Date.parse(b.dueDate) : Number.POSITIVE_INFINITY;
    return at === bt ? 0 : at - bt;
}

/** Take `paid` off a fee's amount; returns what is left of `paid`. */
function applyPaid(fee: ComputedFee, paid: number) {
    const applied = Math.min(paid, fee.amount);
    if (applied <= 0) return paid;
    fee.amount = roundMoney(fee.amount - applied);
    fee.paidAmount = roundMoney((fee.paidAmount ?? 0) + applied);
    return roundMoney(paid - applied);
}

export type FeeLedger = {
    /** What is still owed, fee by fee (fully paid fees left out). */
    fees: ComputedFee[];
    /** Advance left after covering every fee owed. */
    credit: number;
    /** Fees after partial payments but before the advance — what a new payment is allocated against. */
    open: ComputedFee[];
};

export function computePlayerFees(input: FeeInput): ComputedFee[] {
    return computePlayerLedger(input).fees;
}

export function computePlayerLedger(input: FeeInput): FeeLedger {
    const { settings, rows, events, attendedEventIds, now } = input;
    const { settled: paid, partial, credit } = collectSettlements(rows);
    const nowTs = now.getTime();
    const currentIndex = currentMonthIndex(now);
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
        return start ? clubDateTime(start.year, start.month, 1).getTime() : null;
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

    // Partial payments come off their own fee; anything beyond the fee's
    // amount (the fee was lowered since) is not turned into an advance.
    for (const fee of fees) {
        const paidTowards = partial.get(fee.id);
        if (paidTowards) applyPaid(fee, paidTowards);
    }
    const open = fees.filter((fee) => fee.amount > 0).sort(byDueDate);

    // The advance covers the oldest fees first.
    const owed = open.map((fee) => ({ ...fee }));
    let advance = credit;
    for (const fee of owed) {
        if (advance <= 0) break;
        advance = applyPaid(fee, advance);
    }

    const rank: Record<FeeStatus, number> = { overdue: 0, pending: 1, upcoming: 2 };
    return {
        fees: owed.filter((fee) => fee.amount > 0).sort((a, b) => (
            rank[a.status] - rank[b.status]
            || (a.dueDate ? Date.parse(a.dueDate) : 0) - (b.dueDate ? Date.parse(b.dueDate) : 0)
        )),
        credit: advance,
        open,
    };
}

export type PaymentAllocationLine = {
    feeId: string;
    label: string;
    status: FeeStatus;
    dueDate: string | null;
    /** Owed on the fee before / after this payment. */
    owedBefore: number;
    applied: number;
    owedAfter: number;
};

export type PaymentPlan = {
    /** What the payment row stores in fee_ids. */
    tokens: string[];
    /** Fees this payment settles in full. */
    settledIds: string[];
    /** Every fee whose balance the payment changes, oldest first. */
    lines: PaymentAllocationLine[];
    /** Advance left over after this payment (owed nothing more). */
    credit: number;
};

/**
 * How a desk payment of `amount` is split: first over the fees the admin
 * ticked (oldest first), then over every other fee still owed (oldest first),
 * and whatever is left stays as an advance. Without ticked fees it is plain
 * FIFO. A fee gets the whole of what is still owed on it or a partial sum —
 * never more, so 5 RON can no longer settle a 150 RON fee.
 */
export function planPayment(input: FeeInput, amount: number, feeIds: string[] = []): PaymentPlan {
    const before = computePlayerLedger(input);
    const wanted = new Set(feeIds);
    const ordered = [
        ...before.open.filter((fee) => wanted.has(fee.id)),
        ...before.open.filter((fee) => !wanted.has(fee.id)),
    ];

    const tokens: string[] = [];
    const settledIds: string[] = [];
    let left = roundMoney(Math.max(0, amount));
    for (const fee of ordered) {
        if (left <= 0) break;
        const applied = Math.min(left, fee.amount);
        if (applied >= fee.amount) {
            tokens.push(allocationToken(fee.id, null));
            settledIds.push(fee.id);
        } else {
            tokens.push(allocationToken(fee.id, applied));
        }
        left = roundMoney(left - applied);
    }
    if (left > 0) tokens.push(allocationToken(CREDIT_TOKEN, left));

    // Read the books again with the payment in: the preview is the very
    // calculation every screen will show afterwards.
    const after = computePlayerLedger({
        ...input,
        rows: [...input.rows, { id: 0, status: 'paid', feeIds: tokens.join(','), month: null, year: null, amount }],
    });
    const afterById = new Map(after.fees.map((fee) => [fee.id, fee]));
    const beforeById = new Map(before.fees.map((fee) => [fee.id, fee]));
    const lines = [...before.fees, ...after.fees.filter((fee) => !beforeById.has(fee.id))]
        .sort(byDueDate)
        .map((fee) => {
            const owedBefore = beforeById.get(fee.id)?.amount ?? 0;
            const owedAfter = afterById.get(fee.id)?.amount ?? 0;
            return { feeId: fee.id, label: fee.label, status: fee.status, dueDate: fee.dueDate, owedBefore, applied: roundMoney(owedBefore - owedAfter), owedAfter };
        })
        .filter((line) => line.applied !== 0);
    return { tokens, settledIds, lines, credit: after.credit };
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
    const outstanding = fees.reduce((sum, fee) => roundMoney(sum + fee.amount), 0);
    const overdue = overdueFees.reduce((sum, fee) => roundMoney(sum + fee.amount), 0);
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
