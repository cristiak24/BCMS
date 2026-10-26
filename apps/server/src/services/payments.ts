/**
 * Recording money: Stripe Checkout outcomes and desk payments. Kept apart
 * from routes/finance.ts (HTTP, auth, Stripe API calls) so the rules run in
 * integration tests against a real Postgres (PGlite) — see
 * payments.int.test.ts.
 */
import { and, eq, inArray } from 'drizzle-orm';
import { db } from '../db';
import { playerPayments as pgPlayerPayments, players as pgPlayers } from '../db/schema';
import { clubMonth } from '../lib/clubTime';
import { planPayment } from '../lib/feeSchedule';
import { isOutstandingStatus, isPaidStatus, isReversedStatus, parseFeeIds, serializeFeeIds } from '../lib/paymentLedger';
import { roundMoney } from '../lib/money';
import { playerFees, type DbExecutor } from './clubFinance';

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
    const { year, month } = clubMonth(now);
    const inserted = await db
        .insert(pgPlayerPayments)
        .values({
            playerId: params.playerId,
            paidByUserId: params.paidByUserId,
            amount: roundMoney(params.amount),
            month,
            year,
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
export async function voidSettledRequests(playerId: number, feeIds: string[], exec: DbExecutor = db) {
    const requestIds = feeIds
        .filter((id) => id.startsWith('payment:'))
        .map((id) => Number(id.slice('payment:'.length)))
        .filter((id) => Number.isInteger(id) && id > 0);
    if (!requestIds.length) return;

    const rows = await exec
        .select({ id: pgPlayerPayments.id, status: pgPlayerPayments.status })
        .from(pgPlayerPayments)
        .where(inArray(pgPlayerPayments.id, requestIds));
    const toVoid = rows.filter((row) => isOutstandingStatus(row.status)).map((row) => row.id);
    if (!toVoid.length) return;

    await exec
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

type ManualPaymentTarget = {
    playerId: number;
    /** The player's club (its fee settings); null bills nothing, so it all becomes an advance. */
    clubId: number | null;
    amount: number;
    /** Fees the admin ticked; the rest of the amount goes to the oldest fees still owed. */
    feeIds?: unknown;
};

function requestedFeeIds(value: unknown) {
    return parseFeeIds(value).filter((id) => FEE_ID_PATTERN.test(id));
}

async function planFor(target: ManualPaymentTarget, exec: DbExecutor) {
    const query = exec.select().from(pgPlayers).where(eq(pgPlayers.id, target.playerId));
    // Inside a transaction the row lock makes a second desk payment for the
    // same player wait, so both cannot be split over the same balances.
    const [player] = exec === db ? await query : await query.for('update');
    if (!player) throw Object.assign(new Error('Jucătorul nu a fost găsit.'), { statusCode: 404 });
    const { input } = await playerFees(player, target.clubId, new Date(), exec);
    return planPayment(input, target.amount, requestedFeeIds(target.feeIds));
}

/** How a desk payment would be split, without saving it — shown in „Încasează”. */
export async function previewManualPayment(target: ManualPaymentTarget) {
    return planFor(target, db);
}

/**
 * A payment taken at the club desk, allocated by amount (planPayment): it
 * settles a ticked fee only when it covers what is still owed on it, pays
 * part of it otherwise, spills over to the oldest other fees, and keeps any
 * excess as an advance. Without ticked fees it goes to the oldest fees first.
 */
export async function recordManualPayment(input: ManualPaymentTarget & {
    when: Date;
    method: string;
    description: string;
    /** The admin or accountant who took the money. */
    paidByUserId: number | null;
}) {
    return db.transaction(async (tx) => {
        const plan = await planFor(input, tx);
        const { year, month } = clubMonth(input.when);
        const [payment] = await tx
            .insert(pgPlayerPayments)
            .values({
                playerId: input.playerId,
                amount: roundMoney(input.amount),
                month,
                year,
                status: 'paid',
                date: input.when.toISOString(),
                createdAt: new Date().toISOString(),
                paidByUserId: input.paidByUserId,
                feeIds: serializeFeeIds(plan.tokens),
                method: input.method,
                description: input.description,
            })
            .returning();
        await voidSettledRequests(input.playerId, plan.settledIds, tx);
        return { payment, feeIds: plan.tokens, plan };
    });
}

/** Why a payment can't be reversed — the route turns it into a 4xx. */
export class PaymentReversalError extends Error {
    constructor(public readonly status: 400 | 404 | 409, message: string) {
        super(message);
    }
}

/**
 * Storno of a desk payment. Nothing is deleted: the row stays with status
 * „reversed”, which the ledger reads like a void (neither money in nor owed),
 * so the fees it settled are owed again by themselves. A club request it had
 * voided ("payment:17" settled in full) is open again. Stripe payments are not
 * reversed here — that money went through Stripe and is refunded there.
 */
export async function reverseManualPayment(paymentId: number) {
    return db.transaction(async (tx) => {
        const [row] = await tx
            .select()
            .from(pgPlayerPayments)
            .where(eq(pgPlayerPayments.id, paymentId))
            .limit(1)
            .for('update');
        if (!row) throw new PaymentReversalError(404, 'Plata nu a fost găsită.');
        if (isReversedStatus(row.status)) throw new PaymentReversalError(409, 'Plata a fost deja stornată.');
        if (row.stripeSessionId) throw new PaymentReversalError(400, 'Plățile cu cardul se returnează din Stripe, nu de aici.');
        if (!isPaidStatus(row.status)) throw new PaymentReversalError(400, 'Doar o plată încasată poate fi stornată.');

        const [reversed] = await tx
            .update(pgPlayerPayments)
            .set({ status: 'reversed' })
            .where(eq(pgPlayerPayments.id, paymentId))
            .returning();

        const reopened = parseFeeIds(row.feeIds)
            .filter((id) => id.startsWith('payment:') && !id.includes('='))
            .map((id) => Number(id.slice('payment:'.length)))
            .filter((id) => Number.isInteger(id) && id > 0);
        if (reopened.length) {
            await tx
                .update(pgPlayerPayments)
                .set({ status: 'pending' })
                .where(and(
                    inArray(pgPlayerPayments.id, reopened),
                    eq(pgPlayerPayments.playerId, row.playerId),
                    eq(pgPlayerPayments.status, 'void'),
                ));
        }
        return { payment: reversed, reopenedRequests: reopened };
    });
}
