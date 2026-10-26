/**
 * Rules for reading `player_payments` — pure, so they can be unit-tested
 * without a database (see paymentLedger.test.ts).
 *
 * A payment row records money that moved (or a Stripe attempt that failed).
 * `fee_ids` says which fees it settled ("monthly:2026-10", "levy:2026-10",
 * "event:42", "payment:17"). Rows written before that column existed have no
 * fee ids; a paid legacy row is read as settling the monthly fee of its own
 * month, which is what the app assumed at the time.
 *
 * Since desk payments are allocated by amount, a fee id can carry a sum:
 *   "monthly:2026-10"     the fee is settled in full (every older row, Stripe);
 *   "monthly:2026-10=50"  50 RON went towards it, the rest is still owed;
 *   "credit=30"           30 RON paid beyond everything owed (an advance).
 * An older server reading the new tokens matches no fee, so it shows the fee
 * as still owed rather than settled.
 */
import { roundMoney } from './money';

const PAID_STATUSES = new Set(['paid', 'processed', 'succeeded', 'success']);
const FAILED_STATUSES = new Set(['failed', 'error', 'rejected']);
// A request row replaced by a later payment, or a desk payment the club
// reversed (storno, services/payments.ts reverseManualPayment): neither money
// in nor money owed. The row stays for the history.
const VOID_STATUSES = new Set(['void', 'cancelled', 'canceled', 'refunded', 'reversed']);

export function normalizePaymentStatus(status?: string | null) {
    return String(status ?? '').trim().toLowerCase();
}

export function isPaidStatus(status?: string | null) {
    return PAID_STATUSES.has(normalizePaymentStatus(status));
}

export function isReversedStatus(status?: string | null) {
    return normalizePaymentStatus(status) === 'reversed';
}

export function isFailedStatus(status?: string | null) {
    return FAILED_STATUSES.has(normalizePaymentStatus(status));
}

/** Still owed: a request row that is neither paid, failed nor voided. */
export function isOutstandingStatus(status?: string | null) {
    const normalized = normalizePaymentStatus(status);
    return !PAID_STATUSES.has(normalized) && !FAILED_STATUSES.has(normalized) && !VOID_STATUSES.has(normalized);
}

export function monthKey(year: number, month: number) {
    return `${year}-${String(month).padStart(2, '0')}`;
}

export function parseFeeIds(value: unknown): string[] {
    const raw = Array.isArray(value) ? value : String(value ?? '').split(',');
    return Array.from(new Set(raw.map((id) => String(id).trim()).filter(Boolean)));
}

export function serializeFeeIds(ids: string[]) {
    const unique = parseFeeIds(ids);
    return unique.length ? unique.join(',') : null;
}

type LedgerRow = {
    status?: string | null;
    feeIds?: string | string[] | null;
    month?: number | null;
    year?: number | null;
};

export const CREDIT_TOKEN = 'credit';

/** "monthly:2026-10=50" → { id, amount: 50 }; a bare id has amount null (settled in full). */
export function parseAllocationToken(token: string): { id: string; amount: number | null } {
    const at = token.lastIndexOf('=');
    if (at < 0) return { id: token, amount: null };
    const amount = Number(token.slice(at + 1));
    return { id: token.slice(0, at), amount: Number.isFinite(amount) && amount > 0 ? roundMoney(amount) : 0 };
}

export function allocationToken(id: string, amount: number | null) {
    return amount == null ? id : `${id}=${roundMoney(amount)}`;
}

export type Settlements = {
    /** Fees settled in full. */
    settled: Set<string>;
    /** Money paid towards a fee that is still partly owed, summed per fee. */
    partial: Map<string, number>;
    /** Money paid beyond every fee (advance), applied to the oldest fees owed. */
    credit: number;
};

/** What the paid rows have settled, legacy rows included. */
export function collectSettlements(rows: LedgerRow[]): Settlements {
    const settled = new Set<string>();
    const partialSums = new Map<string, number>();
    let credit = 0;
    for (const row of rows) {
        if (!isPaidStatus(row.status)) continue;
        const tokens = parseFeeIds(row.feeIds);
        if (!tokens.length) {
            if (row.month && row.year) settled.add(`monthly:${monthKey(row.year, row.month)}`);
            continue;
        }
        for (const token of tokens) {
            const { id, amount } = parseAllocationToken(token);
            if (!id) continue;
            if (amount == null) settled.add(id);
            else if (id === CREDIT_TOKEN) credit = roundMoney(credit + amount);
            else partialSums.set(id, roundMoney((partialSums.get(id) ?? 0) + amount));
        }
    }
    const partial = new Map<string, number>();
    partialSums.forEach((sum, id) => { if (sum > 0 && !settled.has(id)) partial.set(id, sum); });
    return { settled, partial, credit };
}

/** Every fee id a paid row has settled in full, legacy rows included. */
export function collectPaidFeeIds(rows: LedgerRow[]) {
    return collectSettlements(rows).settled;
}

/**
 * Where Stripe sends the payer back. The client may ask for a URL (the app can
 * run on several origins), but only one on an allowed origin — anything else
 * would turn the checkout into an open redirect to a look-alike site.
 */
export function safeReturnUrl(requested: unknown, fallback: string, isAllowedOrigin: (origin: string) => boolean) {
    if (typeof requested !== 'string' || !requested.trim()) return fallback;
    try {
        const url = new URL(requested.trim());
        if ((url.protocol === 'https:' || url.protocol === 'http:') && isAllowedOrigin(url.origin)) {
            return url.toString();
        }
    } catch {
        // Not an absolute URL — fall through to the default.
    }
    return fallback;
}
