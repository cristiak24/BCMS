/**
 * Rules for reading `player_payments` — pure, so they can be unit-tested
 * without a database (see paymentLedger.test.ts).
 *
 * A payment row records money that moved (or a Stripe attempt that failed).
 * `fee_ids` says which fees it settled ("monthly:2026-10", "levy:2026-10",
 * "event:42", "payment:17"). Rows written before that column existed have no
 * fee ids; a paid legacy row is read as settling the monthly fee of its own
 * month, which is what the app assumed at the time.
 */

const PAID_STATUSES = new Set(['paid', 'processed', 'succeeded', 'success']);
const FAILED_STATUSES = new Set(['failed', 'error', 'rejected']);
// A request row replaced by a later payment: neither money in nor money owed.
const VOID_STATUSES = new Set(['void', 'cancelled', 'canceled', 'refunded']);

export function normalizePaymentStatus(status?: string | null) {
    return String(status ?? '').trim().toLowerCase();
}

export function isPaidStatus(status?: string | null) {
    return PAID_STATUSES.has(normalizePaymentStatus(status));
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

/** Every fee id a paid row has settled, legacy rows included. */
export function collectPaidFeeIds(rows: LedgerRow[]) {
    const paid = new Set<string>();
    for (const row of rows) {
        if (!isPaidStatus(row.status)) continue;
        const ids = parseFeeIds(row.feeIds);
        if (ids.length) {
            ids.forEach((id) => paid.add(id));
        } else if (row.month && row.year) {
            paid.add(`monthly:${monthKey(row.year, row.month)}`);
        }
    }
    return paid;
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
