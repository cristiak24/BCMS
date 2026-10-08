/**
 * Recording money: Stripe Checkout outcomes and desk payments. Kept apart
 * from routes/finance.ts (HTTP, auth, Stripe API calls) so the rules run in
 * integration tests against a real Postgres (PGlite) — see
 * payments.int.test.ts.
 */
import { and, eq, inArray } from 'drizzle-orm';
import { db } from '../db';
import { playerPayments as pgPlayerPayments } from '../db/schema';
import { isOutstandingStatus, monthKey, parseFeeIds, serializeFeeIds } from '../lib/paymentLedger';
import { roundMoney } from '../lib/money';

const ZERO_DECIMAL = new Set(['bif', 'clp', 'djf', 'gnf', 'jpy', 'kmf', 'krw', 'mga', 'pyg', 'rwf', 'ugx', 'vnd', 'vuv', 'xaf', 'xof', 'xpf']);

type CheckoutPaymentRecord = {
    playerId: number;
    sessionId: string;
    status: 'paid' | 'failed';
    amount: number;
    feeIds: string[];
    label: string;
    paidByUserId: number | null;
};

/**
 * Record a Checkout session's outcome exactly once.
 *
 * The webhook and the browser's confirm call both land here, Stripe retries
 * webhooks, and a payer can reload the success page — each of those used to
 * insert another "paid" row. The session id is unique on the table, so every
 * repeat finds the first row instead of writing a new one.
 */
export async function recordCheckoutPayment(params: CheckoutPaymentRecord) {
    const now = new Date();
    const inserted = await db
        .insert(pgPlayerPayments)
        .values({
            playerId: params.playerId,
            paidByUserId: params.paidByUserId,
            amount: roundMoney(params.amount),
            month: now.getMonth() + 1,
            year: now.getFullYear(),
            status: params.status,
            date: now.toISOString(),
            createdAt: now.toISOString(),
            stripeSessionId: params.sessionId,
            feeIds: serializeFeeIds(params.feeIds),
            method: 'card',
            description: params.label,
        })
        .onConflictDoNothing({ target: pgPlayerPayments.stripeSessionId })
        .returning();

    if (inserted[0]) {
        if (params.status === 'paid') {
            await voidSettledRequests(params.playerId, params.feeIds);
        }
        return { payment: inserted[0], duplicate: false };
    }

    const [existing] = await db
        .select()
        .from(pgPlayerPayments)
        .where(eq(pgPlayerPayments.stripeSessionId, params.sessionId))
        .limit(1);
    return { payment: existing ?? null, duplicate: true };
}

/**
 * Request rows ("payment:17") a payment just settled. Their amount is part of
 * the new paid row, so they turn void — neither still owed nor counted as
 * money received a second time.
 */
export async function voidSettledRequests(playerId: number, feeIds: string[]) {
    const requestIds = feeIds
        .filter((id) => id.startsWith('payment:'))
        .map((id) => Number(id.slice('payment:'.length)))
        .filter((id) => Number.isInteger(id) && id > 0);
    if (!requestIds.length) return;

    const rows = await db
        .select({ id: pgPlayerPayments.id, status: pgPlayerPayments.status })
        .from(pgPlayerPayments)
        .where(inArray(pgPlayerPayments.id, requestIds));
    const toVoid = rows.filter((row) => isOutstandingStatus(row.status)).map((row) => row.id);
    if (!toVoid.length) return;

    await db
        .update(pgPlayerPayments)
        .set({ status: 'void' })
        .where(and(inArray(pgPlayerPayments.id, toVoid), eq(pgPlayerPayments.playerId, playerId)));
}

// Stripe caps a metadata value at 500 characters; a basket with months of
// arrears is longer, so the list is split over feeIds, feeIds_1, feeIds_2, …
const FEE_ID_CHUNK = 480;

export function feeIdMetadata(feeIds: string[]) {
    const chunks: string[] = [];
    let current = '';
    for (const id of feeIds) {
        const next = current ? `${current},${id}` : id;
        if (next.length > FEE_ID_CHUNK && current) {
            chunks.push(current);
            current = id;
        } else {
            current = next;
        }
    }
    if (current) chunks.push(current);
    const metadata: Record<string, string> = {};
    chunks.forEach((chunk, index) => { metadata[index === 0 ? 'feeIds' : `feeIds_${index}`] = chunk; });
    return metadata;
}

export function sessionFeeIds(session: { metadata?: Record<string, string> | null }) {
    const metadata = session.metadata ?? {};
    const parts = [metadata.feeIds];
    for (let index = 1; metadata[`feeIds_${index}`]; index += 1) parts.push(metadata[`feeIds_${index}`]);
    return parseFeeIds(parts.filter(Boolean).join(','));
}

/** The parts of a Stripe Checkout session this module reads. */
export type CheckoutSessionLike = {
    id: string;
    mode?: string | null;
    payment_status?: string | null;
    amount_total?: number | null;
    currency?: string | null;
    metadata?: Record<string, string> | null;
};

/**
 * Record what a Checkout session means for the books, exactly once:
 *  - paid → a 'paid' row settling the session's fees (fallback: what was due);
 *  - failed → a 'failed' row (history only, never a debt);
 *  - expired → nothing (an abandoned checkout moved no money).
 */
export async function applyCheckoutSession(
    session: CheckoutSessionLike,
    outcome: 'paid' | 'failed' | 'expired',
    fallbackFeeIds?: (playerId: number) => Promise<string[]>,
) {
    if (outcome === 'expired') return { recorded: false, payment: null, reason: 'checkout_session_expired' as const };
    if (session.mode !== 'payment') return { recorded: false, payment: null, reason: 'checkout_session_not_payment_mode' as const };
    if (outcome === 'paid' && session.payment_status !== 'paid') return { recorded: false, payment: null, reason: 'checkout_session_not_paid' as const };

    const playerId = Number(session.metadata?.playerId);
    if (!Number.isFinite(playerId) || playerId <= 0) {
        throw new Error(`Stripe session ${session.id} is missing playerId metadata.`);
    }
    const currency = String(session.currency || 'ron').toLowerCase();
    const minor = Number(session.amount_total ?? 0);
    const amount = ZERO_DECIMAL.has(currency) ? minor : minor / 100;
    let feeIds = sessionFeeIds(session);
    if (!feeIds.length && outcome === 'paid' && fallbackFeeIds) feeIds = await fallbackFeeIds(playerId);

    const result = await recordCheckoutPayment({
        playerId,
        sessionId: session.id,
        status: outcome,
        amount,
        feeIds,
        label: session.metadata?.label || 'Plată online',
        paidByUserId: Number(session.metadata?.payerUserId) || null,
    });
    return { recorded: !result.duplicate, payment: result.payment, reason: result.duplicate ? 'duplicate' as const : 'recorded' as const };
}

const FEE_ID_PATTERN = /^(?:(?:monthly|levy|facility):\d{4}-\d{2}|(?:event|payment):\d+)$/;

/**
 * A payment taken at the club desk. `feeIds` are the fees it settles (picked
 * in Finanțe → Restanțe); without any, it is the monthly fee of the month it
 * is dated in — what the app assumed before fee ids existed.
 */
export async function recordManualPayment(input: {
    playerId: number;
    amount: number;
    when: Date;
    method: string;
    description: string;
    feeIds?: unknown;
}) {
    const requested = parseFeeIds(input.feeIds).filter((id) => FEE_ID_PATTERN.test(id));
    const feeIds = requested.length
        ? requested
        : [`monthly:${monthKey(input.when.getFullYear(), input.when.getMonth() + 1)}`];
    const [payment] = await db
        .insert(pgPlayerPayments)
        .values({
            playerId: input.playerId,
            amount: roundMoney(input.amount),
            month: input.when.getMonth() + 1,
            year: input.when.getFullYear(),
            status: 'paid',
            date: input.when.toISOString(),
            createdAt: new Date().toISOString(),
            paidByUserId: null,
            feeIds: serializeFeeIds(feeIds),
            method: input.method,
            description: input.description,
        })
        .returning();
    await voidSettledRequests(input.playerId, feeIds);
    return { payment, feeIds };
}
