import { Router, type Request, type Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import Stripe from 'stripe';
import { admin, firestore, nextNumericId, toDate, toIso } from '../lib/firebaseAdmin';
import { requireRequestUser } from '../lib/requestContext';
import { normalizeRole } from '../lib/requestAuth';
import { buildDefaultSettings, DEFAULT_PAYMENT_DUE_DAY, DEFAULT_SETTINGS_ROW_ID } from '../lib/financeDefaults';
import { authenticate, type AuthenticatedRequest } from '../middleware/auth';
import { writeAuditLog, type AuditLogInput } from '../services/auditService';
import { db } from '../db';
import {
    events as pgEvents,
    financialDocuments as pgFinancialDocuments,
    financialSettings as pgFinancialSettings,
    playerPayments as pgPlayerPayments,
    players as pgPlayers,
    playersToTeams as pgPlayersToTeams,
    teams as pgTeams,
    users as pgUsers,
} from '../db/schema';
import { desc, eq, inArray, sql } from 'drizzle-orm';

const router = Router();

// Every finance endpoint requires a verified Firebase ID token. Per-route checks
// below narrow this further (admin/accountant vs. the player's own data). The
// Stripe webhook is mounted separately in app.ts, before this router, because it
// authenticates via the Stripe signature instead.
router.use(authenticate);

/**
 * Audit logging must never cost a user a mutation that already succeeded.
 *
 * `writeAuditLog` does not swallow its own failures, and the existing call sites in
 * clubAdmin/manageAccess leave it unwrapped — so there, a failed audit insert surfaces
 * as a 500 on a change that has already been committed. Money is the wrong surface on
 * which to repeat that: the record is written on a best-effort basis and a failure is
 * loud in the logs but invisible to the caller.
 */
async function recordFinanceAudit(input: AuditLogInput) {
    try {
        await writeAuditLog(input);
    } catch (error) {
        console.error(`[finance/audit] Failed to record ${input.action}:`, error);
    }
}

/**
 * Actor fields for an audit row, sourced only from the verified Bearer identity that
 * `authenticate` attached. Never from client-supplied headers.
 */
/** Fee fields worth a before/after record. All are inputs to real Stripe amounts. */
const AUDITED_SETTINGS_FIELDS = [
    'monthlyPlayerFee',
    'trainingLevy',
    'facilityFee',
    'paymentDueDay',
    'autoAdjust',
] as const;

function settingsAuditChanges(before: FinancialSettingsDoc | null | undefined, updates: Record<string, unknown>) {
    const changes: Record<string, { before: unknown; after: unknown }> = {};

    for (const field of AUDITED_SETTINGS_FIELDS) {
        // Only fields this request actually set — an untouched fee is not a change.
        if (updates[field] === undefined) {
            continue;
        }

        changes[field] = { before: before?.[field] ?? null, after: updates[field] };
    }

    return changes;
}

function financeAuditActor(req: Request) {
    const authed = req as AuthenticatedRequest;

    return {
        actorUserId: authed.user?.id ?? null,
        actorUid: authed.firebaseUser?.uid ?? null,
        actorRole: authed.user?.role ?? null,
        ipAddress: req.ip ?? null,
        userAgent: req.get('user-agent') ?? null,
    };
}

const DEFAULT_STRIPE_PUBLISHABLE_KEY = 'pk_test_51TP7NnCFpLYWSHx5i7EAuPRWUXgoP0lxHFIqDIGvyQOpNIbu4VOg2IMg7H8LW5HgTslJVudDxe3xnGXgRIubcVbA00swDdrRS0';
const DEFAULT_PAYMENT_CURRENCY = (process.env.STRIPE_CURRENCY || 'ron').trim().toLowerCase();
const FINANCE_UPLOAD_MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED_FINANCE_UPLOAD_MIME_TYPES = new Set([
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/webp',
]);
const ALLOWED_FINANCE_UPLOAD_EXTENSIONS = new Set(['.pdf', '.jpg', '.jpeg', '.png', '.webp']);
const ZERO_DECIMAL_CURRENCIES = new Set([
    'bif', 'clp', 'djf', 'gnf', 'jpy', 'kmf', 'krw', 'mga',
    'pyg', 'rwf', 'ugx', 'vnd', 'vuv', 'xaf', 'xof', 'xpf',
]);

type PlayerDoc = {
    id: number;
    name?: string | null;
    firstName?: string | null;
    lastName?: string | null;
    email?: string | null;
    teamId?: number | null;
    clubId?: number | null;
    stripeCustomerId?: string | null;
};

type FinancialSettingsDoc = {
    id: number;
    clubId?: number | null;
    monthlyPlayerFee?: number;
    trainingLevy?: number;
    facilityFee?: number;
    autoAdjust?: number;
    paymentDueDay?: number;
    updatedAt?: FirebaseFirestore.Timestamp | Date | string | null;
};

// Both constants and the neutral seed live in lib/financeDefaults so the seed can be
// unit-tested without importing this module, which opens a database pool on load.

type PlayerPaymentDoc = {
    id?: number | string;
    playerId: number;
    amount?: number | string | null;
    month?: number | null;
    year?: number | null;
    status?: string | null;
    description?: string | null;
    currency?: string | null;
    date?: FirebaseFirestore.Timestamp | Date | string | null;
    createdAt?: FirebaseFirestore.Timestamp | Date | string | null;
    stripeCheckoutSessionId?: string | null;
    stripePaymentIntentId?: string | null;
    receiptUrl?: string | null;
    feeIds?: string | string[] | null;
};

type EventFeeDoc = {
    id: number;
    title: string;
    description?: string | null;
    teamId?: number | null;
    amount?: number | string | null;
    status?: string | null;
    type?: string | null;
    startTime?: FirebaseFirestore.Timestamp | Date | string | null;
};

type PlayerPaymentFee = {
    id: string;
    label: string;
    description: string;
    amount: number;
    currency: string;
    status: 'pending' | 'failed' | 'upcoming';
    dueDate: string | null;
    icon: 'training' | 'trophy' | 'receipt';
    paymentId?: number | string | null;
};

type CurrentPlayer = {
    doc?: FirebaseFirestore.QueryDocumentSnapshot<FirebaseFirestore.DocumentData>;
    data: PlayerDoc;
};

type AdminRecentPayment = {
    id: string;
    playerId: number;
    playerName: string;
    playerEmail: string | null;
    teamName: string | null;
    amount: number;
    currency: string;
    status: string;
    date: string;
    description: string;
    provider: string | null;
    receiptUrl: string | null;
};

let stripeClient: InstanceType<typeof Stripe> | null = null;

function chunkArray<T>(items: T[], size: number) {
    const chunks: T[][] = [];
    for (let index = 0; index < items.length; index += size) {
        chunks.push(items.slice(index, index + size));
    }
    return chunks;
}

function getStripePublishableKey() {
    return process.env.STRIPE_PUBLISHABLE_KEY?.trim() || DEFAULT_STRIPE_PUBLISHABLE_KEY;
}

function getStripe() {
    const secretKey = process.env.STRIPE_SECRET_KEY?.trim();
    if (!secretKey) {
        throw new Error('Stripe is not configured. STRIPE_SECRET_KEY is missing.');
    }

    if (!stripeClient) {
        stripeClient = new Stripe(secretKey);
    }

    return stripeClient;
}

function getStripeIfConfigured() {
    try {
        return getStripe();
    } catch {
        return null;
    }
}

function normalizeStatus(status?: string | null) {
    return String(status ?? '').trim().toLowerCase();
}

function isPaidStatus(status?: string | null) {
    const normalized = normalizeStatus(status);
    return normalized === 'paid' || normalized === 'processed' || normalized === 'succeeded' || normalized === 'success';
}

function isFailedStatus(status?: string | null) {
    const normalized = normalizeStatus(status);
    return normalized === 'failed' || normalized === 'error' || normalized === 'rejected';
}

function asPositiveAmount(value: unknown) {
    const amount = Number(value ?? 0);
    return Number.isFinite(amount) && amount > 0 ? amount : 0;
}

function toMinorUnits(amount: number, currency: string) {
    return ZERO_DECIMAL_CURRENCIES.has(currency.toLowerCase())
        ? Math.round(amount)
        : Math.round(amount * 100);
}

function fromMinorUnits(amount: number | null | undefined, currency: string) {
    const value = Number(amount ?? 0);
    return ZERO_DECIMAL_CURRENCIES.has(currency.toLowerCase()) ? value : value / 100;
}

function isFirestoreNotFound(error: unknown) {
    return Boolean(
        error &&
        typeof error === 'object' &&
        'code' in error &&
        Number((error as { code?: unknown }).code) === 5
    );
}

/**
 * True for Firestore failures that mean "this environment can't reach Firestore"
 * rather than "this document doesn't exist" — missing/!broken Application
 * Default Credentials, and the gRPC UNAVAILABLE (14) / DEADLINE_EXCEEDED (4)
 * codes. These are recoverable here because every caller has a Postgres path.
 */
function isFirestoreUnavailable(error: unknown) {
    if (!error || typeof error !== 'object') {
        return false;
    }

    const code = Number((error as { code?: unknown }).code);
    if (code === 14 || code === 4) {
        return true;
    }

    const message = String((error as { message?: unknown }).message ?? '').toLowerCase();
    return message.includes('default credentials')
        || message.includes('could not refresh access token')
        || message.includes('unable to detect a project id');
}

function canUseFirestoreDocuments() {
    return Boolean(
        process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim() ||
        (process.env.FIREBASE_CLIENT_EMAIL?.trim() && process.env.FIREBASE_PRIVATE_KEY?.trim()) ||
        process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim() ||
        process.env.K_SERVICE ||
        process.env.FUNCTION_TARGET
    );
}

function getPlayerName(player: PlayerDoc) {
    const fromParts = `${player.firstName ?? ''} ${player.lastName ?? ''}`.trim();
    return player.name || fromParts || player.email || 'Player';
}

function formatBillingCycle(date = new Date()) {
    return new Intl.DateTimeFormat('en', { month: 'long', year: 'numeric' }).format(date);
}

function monthName(month?: number | null, year?: number | null) {
    if (!month || !year) {
        return 'Training Fee';
    }

    return `${new Intl.DateTimeFormat('en', { month: 'long' }).format(new Date(year, month - 1, 1))} Training Fee`;
}

function getAppBaseUrl(req: Request) {
    const configured = process.env.APP_BASE_URL || process.env.FRONTEND_URL || req.header('origin');
    if (configured) {
        return configured.trim().replace(/\/+$/, '');
    }

    return `${req.protocol}://${req.get('host')}`.replace(/\/+$/, '');
}

function appendQuery(url: string, query: string) {
    return `${url}${url.includes('?') ? '&' : '?'}${query}`;
}

function getPaymentsReturnUrl(req: Request) {
    const requested = (req.body as { returnUrl?: unknown } | undefined)?.returnUrl;
    if (typeof requested === 'string' && requested.trim()) {
        return requested.trim();
    }

    return `${getAppBaseUrl(req)}/payments`;
}

async function getRequesterEmail(req: Request) {
    const header = req.header('authorization') || '';
    const token = header.match(/^Bearer\s+(.+)$/i)?.[1];
    if (!token) {
        return null;
    }

    const decoded = await admin.auth().verifyIdToken(token);
    return decoded.email ?? null;
}

async function getCurrentPlayer(req: Request): Promise<CurrentPlayer> {
    const email = await getRequesterEmail(req);
    if (!email) {
        throw Object.assign(new Error('You must be signed in to load player payments.'), { statusCode: 401 });
    }

    // Only touch Firestore when this environment actually has credentials for
    // it. Firebase Admin is initialised with a projectId alone when no service
    // account is configured (see lib/firebaseAdmin.ts) — that is enough to
    // VERIFY ID tokens (public JWKS, no ADC) but NOT to read Firestore, which
    // needs Application Default Credentials. Without this guard the query below
    // threw "Could not load the default credentials", which is not a not-found,
    // so it was rethrown and surfaced as a 500/503 on GET /finance/player/summary
    // — even though the Postgres fallback right below it had the player all
    // along. Same guard already used at the other Firestore reads in this file.
    if (canUseFirestoreDocuments()) {
        try {
            const snap = await firestore.collection('players').where('email', '==', email).limit(1).get();
            const doc = snap.docs[0];
            if (doc) {
                return {
                    doc,
                    data: doc.data() as PlayerDoc,
                };
            }
        } catch (error) {
            // A credential/availability failure must not take the request down
            // when Postgres can answer it. Only genuinely unexpected errors
            // propagate.
            if (!isFirestoreNotFound(error) && !isFirestoreUnavailable(error)) {
                throw error;
            }
            console.warn('[finance] Firestore player lookup unavailable, falling back to Postgres:', error);
        }
    }

    const playerRows = await db
        .select()
        .from(pgPlayers)
        .where(sql`lower(${pgPlayers.email}) = ${email.trim().toLowerCase()}`)
        .limit(1);
    const player = playerRows[0];
    const userRows = await db
        .select()
        .from(pgUsers)
        .where(sql`lower(${pgUsers.email}) = ${email.trim().toLowerCase()}`)
        .limit(1);
    const user = userRows[0];

    if (!player && user?.role === 'player') {
        const inserted = await db
            .insert(pgPlayers)
            .values({
                name: user.name,
                firstName: user.firstName,
                lastName: user.lastName,
                email: user.email,
                status: 'active',
                teamId: null,
            })
            .returning();
        const createdPlayer = inserted[0];

        return {
            data: {
                id: createdPlayer.id,
                name: createdPlayer.name,
                firstName: createdPlayer.firstName,
                lastName: createdPlayer.lastName,
                email: createdPlayer.email,
                teamId: createdPlayer.teamId,
                clubId: user.clubId,
            },
        };
    }

    if (!player) {
        throw Object.assign(new Error('No player profile was found for this account.'), { statusCode: 404 });
    }

    return {
        data: {
            id: player.id,
            name: player.name,
            firstName: player.firstName,
            lastName: player.lastName,
            email: player.email,
            teamId: player.teamId,
            clubId: user?.clubId,
        },
    };
}

function getSettingsDocId(clubId?: number | null) {
    return clubId != null && Number.isFinite(clubId) ? `club:${clubId}` : '1';
}

function normalizeMoneyValue(value: unknown) {
    const amount = Number(value);
    return Number.isFinite(amount) && amount >= 0 ? amount : null;
}

// Day-of-month (1..31) by which the monthly fee can be paid. Returns null for
// invalid input so callers can reject it; use resolveDueDay() to read a stored
// value with the default fallback.
function normalizeDueDay(value: unknown) {
    const day = Math.trunc(Number(value));
    return Number.isFinite(day) && day >= 1 && day <= 31 ? day : null;
}

function resolveDueDay(value: unknown) {
    return normalizeDueDay(value) ?? DEFAULT_PAYMENT_DUE_DAY;
}

async function getPlayerClubId(player: PlayerDoc) {
    const directClubId = Number(player.clubId);
    if (Number.isFinite(directClubId) && directClubId > 0) {
        return directClubId;
    }

    const teamIds = await getPlayerTeamIds(player);
    for (const teamId of canUseFirestoreDocuments() ? teamIds : []) {
        try {
            const teamSnap = await firestore.collection('teams').where('id', '==', teamId).limit(1).get();
            const teamDoc = teamSnap.docs[0];
            const clubId = Number((teamDoc?.data() as { clubId?: number } | undefined)?.clubId);
            if (Number.isFinite(clubId) && clubId > 0) {
                return clubId;
            }
        } catch (error) {
            if (!isFirestoreNotFound(error) && !isFirestoreUnavailable(error)) {
                throw error;
            }
        }
    }

    if (teamIds.size) {
        const teamRows = await db
            .select({ clubId: pgTeams.clubId })
            .from(pgTeams)
            .where(inArray(pgTeams.id, Array.from(teamIds)))
            .limit(1);
        const clubId = Number(teamRows[0]?.clubId);
        if (Number.isFinite(clubId) && clubId > 0) {
            return clubId;
        }
    }

    return null;
}

function seedSettingsData(clubId?: number | null): FinancialSettingsDoc {
    // Seeded from neutral defaults only. This used to read club 1's live settings and
    // hand them to whichever club was being onboarded, which meant a new tenant began
    // charging another club's fees — and these numbers feed real Stripe amounts, so
    // the blast radius was money taken from real parents, not a cosmetic default.
    return buildDefaultSettings(clubId);
}

async function ensureSettings(clubId?: number | null) {
    if (!canUseFirestoreDocuments()) {
        throw Object.assign(new Error('Firestore settings are not available in this environment.'), { code: 5 });
    }

    const ref = firestore.collection('financialSettings').doc(getSettingsDocId(clubId));
    const snap = await ref.get();

    if (snap.exists) {
        return snap;
    }

    await ref.set(seedSettingsData(clubId));
    return ref.get();
}

async function getSettingsData(clubId?: number | null) {
    try {
        const snap = await ensureSettings(clubId);
        return snap.data() as FinancialSettingsDoc;
    } catch (error) {
        if (!isFirestoreNotFound(error)) {
            console.error('[finance/settings] Firestore settings fallback:', error);
        }
    }

    // TODO(schema): `financial_settings` has no `club_id` column, so both this read
    // and the PATCH /settings write overload the primary key as the tenant key. That
    // only holds while club ids and the settings id sequence cannot collide, which
    // nothing enforces. The table needs a real `club_id` column plus a backfill
    // migration; until then, read and write MUST keep using the same key or every
    // club silently reads another club's fees.
    // Both settings inserts pin `id` explicitly, so financial_settings_id_seq never
    // advances and any future insert that omits the id will collide with an existing
    // club's row — the migration adding `club_id` must also setval the sequence past
    // the highest id in use.
    if (clubId == null) {
        // Never fall back to row 1 for a caller we could not scope. These values drive
        // Stripe charges, so handing back some other club's real fees is strictly worse
        // than handing back nothing chargeable.
        console.warn('[finance/settings] No club id resolved for caller; returning safe defaults instead of row 1.');
        return {
            id: DEFAULT_SETTINGS_ROW_ID,
            clubId: null,
            monthlyPlayerFee: 0,
            trainingLevy: 0,
            facilityFee: 0,
            autoAdjust: 1,
            paymentDueDay: DEFAULT_PAYMENT_DUE_DAY,
            updatedAt: new Date(),
        };
    }

    const rows = await db
        .select()
        .from(pgFinancialSettings)
        .where(eq(pgFinancialSettings.id, clubId))
        .limit(1);
    const existing = rows[0];
    if (existing) {
        return {
            id: existing.id,
            clubId: clubId ?? null,
            monthlyPlayerFee: existing.monthlyPlayerFee,
            trainingLevy: existing.trainingLevy,
            facilityFee: existing.facilityFee,
            autoAdjust: existing.autoAdjust,
            paymentDueDay: resolveDueDay(existing.paymentDueDay),
            updatedAt: existing.updatedAt,
        };
    }

    // The id has to be pinned to the club, not left to the serial default: the read
    // above looks the row up by club id, so an auto-assigned id would never be found
    // again and every request would insert another orphan row.
    const inserted = await db
        .insert(pgFinancialSettings)
        .values({
            id: clubId,
            monthlyPlayerFee: 0,
            trainingLevy: 0,
            facilityFee: 0,
            autoAdjust: 1,
            updatedAt: new Date().toISOString(),
        })
        .returning();

    return {
        id: inserted[0].id,
        clubId: clubId ?? null,
        monthlyPlayerFee: inserted[0].monthlyPlayerFee,
        trainingLevy: inserted[0].trainingLevy,
        facilityFee: inserted[0].facilityFee,
        autoAdjust: inserted[0].autoAdjust,
        paymentDueDay: resolveDueDay(inserted[0].paymentDueDay),
        updatedAt: inserted[0].updatedAt,
    };
}

async function getPlayerSettingsData(player: PlayerDoc) {
    return getSettingsData(await getPlayerClubId(player));
}

async function resolveAdminFinanceClubId(req: Request, res: Response) {
    const user = await requireRequestUser(req, res);
    if (!user) {
        return null;
    }

    const role = normalizeRole(user.role);
    if (!['admin', 'superadmin', 'accountant'].includes(role)) {
        res.status(403).json({ error: 'Admin finance access is required.' });
        return null;
    }

    if (user.clubId != null) {
        return Number(user.clubId);
    }

    if (role === 'superadmin') {
        const requestedClubId = Number((req.query?.clubId ?? (req.body as { clubId?: unknown } | undefined)?.clubId));
        return Number.isFinite(requestedClubId) && requestedClubId > 0 ? requestedClubId : null;
    }

    res.status(403).json({ error: 'Your account is not assigned to a club.' });
    return null;
}

async function getPlayerTeamIds(player: PlayerDoc) {
    const ids = new Set<number>();
    if (player.teamId != null) {
        ids.add(Number(player.teamId));
    }

    const addMembershipsFromPostgres = async () => {
        const membershipRows = await db
            .select({ teamId: pgPlayersToTeams.teamId })
            .from(pgPlayersToTeams)
            .where(eq(pgPlayersToTeams.playerId, player.id));
        membershipRows.forEach((row) => {
            const teamId = Number(row.teamId);
            if (Number.isFinite(teamId)) {
                ids.add(teamId);
            }
        });
    };

    // No Firestore credentials in this environment — go straight to Postgres
    // rather than paying an ADC timeout to discover the same thing.
    if (!canUseFirestoreDocuments()) {
        await addMembershipsFromPostgres();
        return ids;
    }

    try {
        const membershipsSnap = await firestore.collection('playersToTeams').where('playerId', '==', player.id).get();
        membershipsSnap.docs.forEach((docSnap) => {
            const teamId = Number((docSnap.data() as { teamId?: number }).teamId);
            if (Number.isFinite(teamId)) {
                ids.add(teamId);
            }
        });
    } catch (error) {
        if (!isFirestoreNotFound(error) && !isFirestoreUnavailable(error)) {
            throw error;
        }

        await addMembershipsFromPostgres();
    }

    return ids;
}

async function getPlayerPaymentRows(playerId: number) {
    // Skip Firestore outright when this environment has no credentials for it:
    // attempting the call costs a ~30s Application-Default-Credentials timeout
    // per read before failing, which is what made this endpoint hang.
    if (canUseFirestoreDocuments()) {
        try {
            const snap = await firestore.collection('playerPayments').where('playerId', '==', playerId).get();
            return snap.docs.map((docSnap) => ({
                ref: docSnap.ref,
                data: docSnap.data() as PlayerPaymentDoc,
            }));
        } catch (error) {
            if (!isFirestoreNotFound(error) && !isFirestoreUnavailable(error)) {
                throw error;
            }
        }
    }

    const rows = await db
        .select()
        .from(pgPlayerPayments)
        .where(eq(pgPlayerPayments.playerId, playerId));

    return rows.map((row) => ({
        data: {
            id: row.id,
            playerId: row.playerId,
            amount: row.amount,
            month: row.month,
            year: row.year,
            status: row.status,
            date: row.date,
            createdAt: row.createdAt,
        } satisfies PlayerPaymentDoc,
    }));
}

async function getPlayerByNumericId(playerId: number) {
    if (canUseFirestoreDocuments()) {
        try {
            const snap = await firestore.collection('players').where('id', '==', playerId).limit(1).get();
            const doc = snap.docs[0];
            if (doc) {
                return doc.data() as PlayerDoc;
            }
        } catch (error) {
            if (!isFirestoreNotFound(error) && !isFirestoreUnavailable(error)) {
                throw error;
            }
        }
    }

    const rows = await db.select().from(pgPlayers).where(eq(pgPlayers.id, playerId)).limit(1);
    const player = rows[0];
    return player
        ? {
            id: player.id,
            name: player.name,
            firstName: player.firstName,
            lastName: player.lastName,
            email: player.email,
            teamId: player.teamId,
        } satisfies PlayerDoc
        : null;
}

function getPaidFeeIds(paymentRows: Array<{ data: PlayerPaymentDoc }>) {
    const paidFeeIds = new Set<string>();

    paymentRows
        .filter(({ data }) => isPaidStatus(data.status))
        .forEach(({ data }) => {
            const rawFeeIds = Array.isArray(data.feeIds)
                ? data.feeIds
                : String(data.feeIds ?? '').split(',');

            rawFeeIds
                .map((feeId) => String(feeId).trim())
                .filter(Boolean)
                .forEach((feeId) => paidFeeIds.add(feeId));
        });

    return paidFeeIds;
}

async function buildEventFees(player: PlayerDoc, currency: string, paidFeeIds: Set<string>): Promise<PlayerPaymentFee[]> {
    const teamIds = await getPlayerTeamIds(player);
    if (!teamIds.size) {
        return [];
    }

    const now = new Date();
    const eventRowsFromPostgres = async () => await db
        .select()
        .from(pgEvents)
        .where(inArray(pgEvents.teamId, Array.from(teamIds))) as EventFeeDoc[];

    let eventRows: EventFeeDoc[];
    if (!canUseFirestoreDocuments()) {
        eventRows = await eventRowsFromPostgres();
    } else {
        try {
            const eventsSnap = await firestore.collection('events').get();
            eventRows = eventsSnap.docs.map((docSnap) => docSnap.data() as EventFeeDoc);
        } catch (error) {
            if (!isFirestoreNotFound(error) && !isFirestoreUnavailable(error)) {
                throw error;
            }

            eventRows = await eventRowsFromPostgres();
        }
    }

    return eventRows
        .filter((event) => {
            const amount = asPositiveAmount(event.amount);
            const startsAt = toDate(event.startTime);
            const teamId = Number(event.teamId);
            const feeId = `event:${event.id}`;
            return amount > 0
                && !paidFeeIds.has(feeId)
                && Number.isFinite(teamId)
                && teamIds.has(teamId)
                && startsAt
                && startsAt >= now
                && normalizeStatus(event.status) !== 'cancelled';
        })
        .sort((a, b) => (toDate(a.startTime)?.getTime() ?? 0) - (toDate(b.startTime)?.getTime() ?? 0))
        .slice(0, 6)
        .map((event) => ({
            id: `event:${event.id}`,
            label: event.title || 'Team Event Fee',
            description: event.description || 'Team event registration fee',
            amount: asPositiveAmount(event.amount),
            currency,
            status: 'upcoming' as const,
            dueDate: toIso(event.startTime) ?? null,
            icon: event.type === 'match' ? 'trophy' : 'receipt',
        }));
}

async function buildPlayerFees(player: PlayerDoc, paymentRows: Array<{ data: PlayerPaymentDoc }>, currency: string): Promise<PlayerPaymentFee[]> {
    const settings = await getPlayerSettingsData(player);
    const currentDate = new Date();
    const currentMonth = currentDate.getMonth() + 1;
    const currentYear = currentDate.getFullYear();
    const paidFeeIds = getPaidFeeIds(paymentRows);

    const fees: PlayerPaymentFee[] = paymentRows
        .filter(({ data }) => !isPaidStatus(data.status))
        .map(({ data }) => {
            const amount = asPositiveAmount(data.amount);
            const status: PlayerPaymentFee['status'] = isFailedStatus(data.status) ? 'failed' : 'pending';
            return {
                id: `payment:${data.id ?? `${data.month ?? currentMonth}-${data.year ?? currentYear}`}`,
                label: data.description || monthName(data.month, data.year),
                description: data.description ? 'Club payment request' : 'Recurring monthly coaching fee',
                amount,
                currency: data.currency || currency,
                status,
                dueDate: toIso(data.date ?? data.createdAt) ?? null,
                icon: 'training' as const,
                paymentId: data.id ?? null,
            };
        })
        .filter((fee) => fee.amount > 0);

    const hasCurrentMonthlyFee = paymentRows.some(({ data }) => (
        Number(data.month) === currentMonth &&
        Number(data.year) === currentYear
    ));

    if (!hasCurrentMonthlyFee) {
        const monthlyFeeId = `monthly:${currentYear}-${String(currentMonth).padStart(2, '0')}`;
        const monthlyPlayerFee = asPositiveAmount(settings.monthlyPlayerFee);
        if (monthlyPlayerFee > 0 && !paidFeeIds.has(monthlyFeeId)) {
            fees.push({
                id: monthlyFeeId,
                label: monthName(currentMonth, currentYear),
                description: 'Recurring monthly coaching fee',
                amount: monthlyPlayerFee,
                currency,
                status: 'upcoming',
                // The monthly fee can be paid until the configured due day of the
                // following month (e.g. due day 25 → July's fee is due Aug 25).
                dueDate: new Date(currentYear, currentMonth, resolveDueDay(settings.paymentDueDay)).toISOString(),
                icon: 'training',
            });
        }
    }

    const trainingLevy = asPositiveAmount(settings.trainingLevy);
    const trainingLevyId = `levy:${currentYear}-${String(currentMonth).padStart(2, '0')}`;
    if (trainingLevy > 0 && !paidFeeIds.has(trainingLevyId)) {
        fees.push({
            id: trainingLevyId,
            label: 'Training Levy',
            description: 'Club training and development levy',
            amount: trainingLevy,
            currency,
            status: 'upcoming',
            dueDate: new Date(currentYear, currentMonth - 1, 28).toISOString(),
            icon: 'receipt',
        });
    }

    const facilityFee = asPositiveAmount(settings.facilityFee);
    const facilityFeeId = `facility:${currentYear}-${String(currentMonth).padStart(2, '0')}`;
    if (facilityFee > 0 && !paidFeeIds.has(facilityFeeId)) {
        fees.push({
            id: facilityFeeId,
            label: 'Facility Fee',
            description: 'Court and facility contribution',
            amount: facilityFee,
            currency,
            status: 'upcoming',
            dueDate: new Date(currentYear, currentMonth - 1, 28).toISOString(),
            icon: 'receipt',
        });
    }

    return [...fees, ...(await buildEventFees(player, currency, paidFeeIds))];
}

function buildTransactions(paymentRows: Array<{ data: PlayerPaymentDoc }>, currency: string) {
    return paymentRows
        .filter(({ data }) => isPaidStatus(data.status) || isFailedStatus(data.status))
        .sort((a, b) => (toDate(b.data.date ?? b.data.createdAt)?.getTime() ?? 0) - (toDate(a.data.date ?? a.data.createdAt)?.getTime() ?? 0))
        .slice(0, 12)
        .map(({ data }) => ({
            id: String(data.id ?? data.stripeCheckoutSessionId ?? `${data.month}-${data.year}`),
            label: data.description || monthName(data.month, data.year),
            description: data.stripeCheckoutSessionId ? 'Stripe Checkout payment' : 'Club payment record',
            amount: asPositiveAmount(data.amount),
            currency: data.currency || currency,
            status: isPaidStatus(data.status) ? 'success' : 'error',
            date: toIso(data.date ?? data.createdAt) ?? new Date().toISOString(),
            receiptUrl: data.receiptUrl ?? null,
        }));
}

async function buildAdminRecentPayments(clubId: number | null, limit = 12, teamId: number | null = null): Promise<AdminRecentPayment[]> {
    const allTeamRows = clubId == null
        ? await db.select({ id: pgTeams.id, name: pgTeams.name }).from(pgTeams)
        : await db.select({ id: pgTeams.id, name: pgTeams.name }).from(pgTeams).where(eq(pgTeams.clubId, clubId));
    // When scoped to a single team, restrict every downstream lookup to it so the
    // report only contains that team's players' payments.
    const teamRows = teamId != null ? allTeamRows.filter((team) => team.id === teamId) : allTeamRows;
    const teamNameById = new Map(teamRows.map((team) => [team.id, team.name]));
    const teamIds = teamRows.map((team) => team.id);

    const directPlayers = clubId == null && teamId == null
        ? await db.select().from(pgPlayers)
        : teamIds.length
            ? await db.select().from(pgPlayers).where(inArray(pgPlayers.teamId, teamIds))
            : [];
    const relationRows = teamIds.length
        ? await db
            .select({ player: pgPlayers, teamId: pgPlayersToTeams.teamId })
            .from(pgPlayersToTeams)
            .innerJoin(pgPlayers, eq(pgPlayersToTeams.playerId, pgPlayers.id))
            .where(inArray(pgPlayersToTeams.teamId, teamIds))
        : [];
    // Club-wide fallback players (users without an explicit team) don't belong to
    // a single team, so skip them entirely when the report is team-scoped.
    const clubUserRows = clubId == null || teamId != null
        ? []
        : await db
            .select({ email: pgUsers.email })
            .from(pgUsers)
            .where(eq(pgUsers.clubId, clubId));
    const clubUserEmails = clubUserRows.map((user) => user.email.trim().toLowerCase());
    const unassignedClubPlayers = clubUserEmails.length
        ? await db
            .select()
            .from(pgPlayers)
            .where(inArray(pgPlayers.email, clubUserEmails))
        : [];

    const playersById = new Map<number, typeof pgPlayers.$inferSelect>();
    const playerTeamNameById = new Map<number, string | null>();

    directPlayers.forEach((player) => {
        playersById.set(player.id, player);
        playerTeamNameById.set(player.id, player.teamId != null ? teamNameById.get(player.teamId) ?? null : null);
    });

    relationRows.forEach((row) => {
        playersById.set(row.player.id, row.player);
        if (!playerTeamNameById.has(row.player.id)) {
            playerTeamNameById.set(row.player.id, teamNameById.get(row.teamId) ?? null);
        }
    });

    unassignedClubPlayers.forEach((player) => {
        if (!playersById.has(player.id)) {
            playersById.set(player.id, player);
            playerTeamNameById.set(player.id, player.teamId != null ? teamNameById.get(player.teamId) ?? null : null);
        }
    });

    const playerIds = Array.from(playersById.keys());
    if (!playerIds.length) {
        return [];
    }

    const postgresPaymentRows = await db
        .select()
        .from(pgPlayerPayments)
        .where(inArray(pgPlayerPayments.playerId, playerIds));

    const payments: AdminRecentPayment[] = postgresPaymentRows
        .map((payment) => {
            const player = playersById.get(payment.playerId);
            const paymentDate = toIso(payment.date) ?? toIso(payment.createdAt) ?? new Date().toISOString();
            return {
                id: String(payment.id),
                playerId: payment.playerId,
                playerName: player ? getPlayerName(player) : `Player #${payment.playerId}`,
                playerEmail: player?.email ?? null,
                teamName: playerTeamNameById.get(payment.playerId) ?? null,
                amount: asPositiveAmount(payment.amount),
                currency: DEFAULT_PAYMENT_CURRENCY,
                status: payment.status,
                date: paymentDate,
                description: monthName(payment.month, payment.year),
                provider: null,
                receiptUrl: null,
            } satisfies AdminRecentPayment;
        });

    if (canUseFirestoreDocuments()) {
        try {
            const firestorePayments: PlayerPaymentDoc[] = [];
            for (const playerIdChunk of chunkArray(playerIds, 30)) {
                const snap = await firestore
                    .collection('playerPayments')
                    .where('playerId', 'in', playerIdChunk)
                    .get();
                snap.docs.forEach((docSnap) => {
                    firestorePayments.push({
                        ...(docSnap.data() as PlayerPaymentDoc),
                        id: (docSnap.data() as PlayerPaymentDoc).id ?? docSnap.id,
                    });
                });
            }

            firestorePayments.forEach((payment) => {
                const playerId = Number(payment.playerId);
                const player = playersById.get(playerId);
                if (!player) {
                    return;
                }

                const paymentDate = toIso(payment.date) ?? toIso(payment.createdAt) ?? new Date().toISOString();
                payments.push({
                    id: String(payment.id ?? payment.stripeCheckoutSessionId ?? `${payment.playerId}-${paymentDate}`),
                    playerId,
                    playerName: getPlayerName(player),
                    playerEmail: player.email ?? null,
                    teamName: playerTeamNameById.get(playerId) ?? null,
                    amount: asPositiveAmount(payment.amount),
                    currency: payment.currency || DEFAULT_PAYMENT_CURRENCY,
                    status: payment.status || 'paid',
                    date: paymentDate,
                    description: payment.description || monthName(payment.month, payment.year),
                    provider: payment.stripeCheckoutSessionId ? 'stripe' : null,
                    receiptUrl: payment.receiptUrl ?? null,
                });
            });
        } catch (error) {
            if (!isFirestoreNotFound(error)) {
                console.error('[GET /api/finance/admin/recent-payments] Firestore payments fallback:', error);
            }
        }
    }

    const seenPayments = new Set<string>();
    return payments
        .filter((payment) => {
            const dedupeKey = [
                payment.provider ?? 'manual',
                payment.id,
                payment.playerId,
                payment.date,
                payment.amount,
            ].join(':');
            if (seenPayments.has(dedupeKey)) {
                return false;
            }
            seenPayments.add(dedupeKey);
            return true;
        })
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
        .slice(0, limit);
}

function buildDueLabel(fees: PlayerPaymentFee[]) {
    if (!fees.length) {
        return 'Settled';
    }

    const dueTimes = fees
        .map((fee) => toDate(fee.dueDate)?.getTime() ?? null)
        .filter((value): value is number => value != null)
        .sort((a, b) => a - b);

    if (!dueTimes.length) {
        return 'Due this cycle';
    }

    const diffDays = Math.ceil((dueTimes[0] - Date.now()) / 86400000);
    if (diffDays <= 0) {
        return 'Due now';
    }

    return diffDays === 1 ? 'Due in 1 day' : `Due in ${diffDays} days`;
}

async function listPlayerPaymentMethods(player: PlayerDoc) {
    const stripe = getStripeIfConfigured();
    if (!stripe || !player.stripeCustomerId) {
        return [];
    }

    try {
        const methods = await stripe.paymentMethods.list({
            customer: player.stripeCustomerId,
            type: 'card',
            limit: 5,
        });

        return methods.data.map((method: any, index: number) => ({
            id: method.id,
            brand: method.card?.brand ?? 'card',
            last4: method.card?.last4 ?? '----',
            expMonth: method.card?.exp_month ?? null,
            expYear: method.card?.exp_year ?? null,
            isDefault: index === 0,
        }));
    } catch (error) {
        console.error('[GET /api/finance/player/summary] Stripe payment methods error:', error);
        return [];
    }
}

async function ensureStripeCustomer(player: CurrentPlayer) {
    if (player.data.stripeCustomerId) {
        return player.data.stripeCustomerId;
    }

    const stripe = getStripe();
    const customer = await stripe.customers.create({
        email: player.data.email ?? undefined,
        name: getPlayerName(player.data),
        metadata: {
            playerId: String(player.data.id),
        },
    });

    if (player.doc) {
        await player.doc.ref.set({ stripeCustomerId: customer.id }, { merge: true });
    }
    player.data.stripeCustomerId = customer.id;
    return customer.id;
}

function selectedFeesFromBody(allFees: PlayerPaymentFee[], feeIds: unknown) {
    const requestedIds = Array.isArray(feeIds)
        ? feeIds.map((id) => String(id))
        : [];

    if (!requestedIds.length) {
        return allFees;
    }

    const requested = new Set(requestedIds);
    return allFees.filter((fee) => requested.has(fee.id));
}

async function markPaymentRowsPaid(params: {
    playerId: number;
    fees: PlayerPaymentFee[];
    amount: number;
    currency: string;
    label: string;
    checkoutSessionId: string;
    paymentIntentId: string | null;
    receiptUrl: string | null;
}) {
    let usePostgresPayments = false;
    try {
        const existingSessionSnap = await firestore
            .collection('playerPayments')
            .where('stripeCheckoutSessionId', '==', params.checkoutSessionId)
            .limit(1)
            .get();

        if (!existingSessionSnap.empty) {
            return existingSessionSnap.docs[0].data();
        }
    } catch (error) {
        if (!isFirestoreNotFound(error)) {
            throw error;
        }
        usePostgresPayments = true;
    }

    let updatedExistingRows = 0;
    if (!usePostgresPayments) {
        for (const fee of params.fees) {
            if (!String(fee.id).startsWith('payment:') || fee.paymentId == null) {
                continue;
            }

            const paymentId = Number(fee.paymentId);
            if (!Number.isFinite(paymentId)) {
                continue;
            }

            const paymentSnap = await firestore.collection('playerPayments').where('id', '==', paymentId).limit(1).get();
            const paymentDoc = paymentSnap.docs[0];
            if (!paymentDoc) {
                continue;
            }

            await paymentDoc.ref.set({
                status: 'paid',
                date: new Date(),
                provider: 'stripe',
                currency: params.currency,
                stripeCheckoutSessionId: params.checkoutSessionId,
                stripePaymentIntentId: params.paymentIntentId,
                receiptUrl: params.receiptUrl,
                feeIds: params.fees.map((fee) => fee.id),
            }, { merge: true });
            updatedExistingRows += 1;
        }
    }

    if (updatedExistingRows === params.fees.length) {
        return { updated: updatedExistingRows };
    }

    const now = new Date();
    if (usePostgresPayments) {
        const inserted = await db
            .insert(pgPlayerPayments)
            .values({
                playerId: params.playerId,
                amount: Math.round(params.amount),
                month: now.getMonth() + 1,
                year: now.getFullYear(),
                status: 'paid',
                date: now.toISOString(),
                createdAt: now.toISOString(),
            })
            .returning();
        return inserted[0];
    }

    const id = await nextNumericId('playerPayments');
    const record = {
        id,
        playerId: params.playerId,
        amount: params.amount,
        month: now.getMonth() + 1,
        year: now.getFullYear(),
        status: 'paid',
        date: now,
        createdAt: now,
        description: params.label,
        provider: 'stripe',
        currency: params.currency,
        stripeCheckoutSessionId: params.checkoutSessionId,
        stripePaymentIntentId: params.paymentIntentId,
        receiptUrl: params.receiptUrl,
        feeIds: params.fees.map((fee) => fee.id),
    };

    await firestore.collection('playerPayments').doc(String(id)).set(record);
    return record;
}

async function markCheckoutSessionFailed(sessionId: string, reason: 'failed' | 'expired') {
    const stripe = getStripe();
    const session = await stripe.checkout.sessions.retrieve(sessionId);

    if (session.mode !== 'payment') {
        return {
            recorded: false,
            reason: 'checkout_session_not_payment_mode',
        };
    }

    let usePostgresPayments = false;
    try {
        const existingSessionSnap = await firestore
            .collection('playerPayments')
            .where('stripeCheckoutSessionId', '==', session.id)
            .limit(1)
            .get();

        if (!existingSessionSnap.empty) {
            const existingDoc = existingSessionSnap.docs[0];
            await existingDoc.ref.set({
                status: 'failed',
                failureReason: reason,
                updatedAt: new Date(),
            }, { merge: true });
            return {
                recorded: true,
                payment: existingDoc.data(),
            };
        }
    } catch (error) {
        if (!isFirestoreNotFound(error)) {
            throw error;
        }
        usePostgresPayments = true;
    }

    const playerId = Number(session.metadata?.playerId);
    if (!Number.isFinite(playerId)) {
        throw new Error(`Stripe session ${session.id} is missing playerId metadata.`);
    }

    const currency = (session.currency || DEFAULT_PAYMENT_CURRENCY).toLowerCase();
    const amount = fromMinorUnits(session.amount_total, currency);
    const now = new Date();
    if (usePostgresPayments) {
        const inserted = await db
            .insert(pgPlayerPayments)
            .values({
                playerId,
                amount: Math.round(amount),
                month: now.getMonth() + 1,
                year: now.getFullYear(),
                status: 'failed',
                date: now.toISOString(),
                createdAt: now.toISOString(),
            })
            .returning();

        return {
            recorded: true,
            payment: inserted[0],
        };
    }

    const id = await nextNumericId('playerPayments');
    const record = {
        id,
        playerId,
        amount,
        month: now.getMonth() + 1,
        year: now.getFullYear(),
        status: 'failed',
        failureReason: reason,
        date: now,
        createdAt: now,
        description: session.metadata?.label || (reason === 'expired' ? 'Expired Stripe checkout' : 'Failed Stripe checkout'),
        provider: 'stripe',
        currency,
        stripeCheckoutSessionId: session.id,
        stripePaymentIntentId: typeof session.payment_intent === 'string' ? session.payment_intent : null,
        receiptUrl: null,
        feeIds: String(session.metadata?.feeIds ?? '')
            .split(',')
            .map((value) => value.trim())
            .filter(Boolean),
    };

    await firestore.collection('playerPayments').doc(String(id)).set(record);
    return {
        recorded: true,
        payment: record,
    };
}

async function fulfillPaidCheckoutSession(sessionId: string) {
    const stripe = getStripe();
    const session = await stripe.checkout.sessions.retrieve(sessionId, {
        expand: ['payment_intent.latest_charge'],
    });

    if (session.mode !== 'payment' || session.payment_status !== 'paid') {
        return {
            fulfilled: false,
            reason: 'checkout_session_not_paid',
        };
    }

    const playerId = Number(session.metadata?.playerId);
    if (!Number.isFinite(playerId)) {
        throw new Error(`Stripe session ${session.id} is missing playerId metadata.`);
    }

    const player = await getPlayerByNumericId(playerId);
    if (!player) {
        throw new Error(`Player ${playerId} from Stripe session ${session.id} was not found.`);
    }

    const currency = (session.currency || DEFAULT_PAYMENT_CURRENCY).toLowerCase();
    const paymentIntent = session.payment_intent as any;
    const latestCharge = paymentIntent && typeof paymentIntent.latest_charge !== 'string'
        ? paymentIntent.latest_charge as any
        : null;
    const amount = fromMinorUnits(session.amount_total, currency);
    const feeIds = String(session.metadata?.feeIds ?? '')
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean);

    const paymentRows = await getPlayerPaymentRows(player.id);
    const allFees = await buildPlayerFees(player, paymentRows, currency);
    const paidFees = selectedFeesFromBody(allFees, feeIds);
    const record = await markPaymentRowsPaid({
        playerId: player.id,
        fees: paidFees.length ? paidFees : allFees,
        amount,
        currency,
        label: session.metadata?.label || 'Stripe payment',
        checkoutSessionId: session.id,
        paymentIntentId: paymentIntent?.id ?? null,
        receiptUrl: latestCharge?.receipt_url ?? null,
    });

    return {
        fulfilled: true,
        payment: record,
    };
}

function handleRouteError(res: Response, error: unknown, fallback: string) {
    const statusCode = typeof error === 'object' && error && 'statusCode' in error
        ? Number((error as { statusCode?: number }).statusCode)
        : 500;

    console.error(fallback, error);
    res.status(Number.isFinite(statusCode) ? statusCode : 500).json({
        error: error instanceof Error ? error.message : fallback,
    });
}

export async function stripeWebhookHandler(req: Request, res: Response) {
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
    if (!webhookSecret) {
        res.status(500).json({ error: 'Stripe webhook secret is not configured.' });
        return;
    }

    const signature = req.header('stripe-signature');
    if (!signature) {
        res.status(400).json({ error: 'Missing Stripe-Signature header.' });
        return;
    }

    let event: any;
    try {
        event = getStripe().webhooks.constructEvent(req.body, signature, webhookSecret);
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Invalid Stripe webhook signature.';
        console.error('[POST /api/finance/stripe/webhook] signature error:', message);
        res.status(400).send(`Webhook Error: ${message}`);
        return;
    }

    try {
        switch (event.type) {
            case 'checkout.session.completed':
            case 'checkout.session.async_payment_succeeded': {
                const session = event.data.object as { id?: string };
                if (session.id) {
                    await fulfillPaidCheckoutSession(session.id);
                }
                break;
            }
            case 'checkout.session.async_payment_failed': {
                const session = event.data.object as { id?: string };
                if (session.id) {
                    await markCheckoutSessionFailed(session.id, 'failed');
                }
                break;
            }
            case 'checkout.session.expired': {
                const session = event.data.object as { id?: string };
                if (session.id) {
                    await markCheckoutSessionFailed(session.id, 'expired');
                }
                break;
            }
            default:
                break;
        }

        res.json({ received: true });
    } catch (error) {
        console.error('[POST /api/finance/stripe/webhook] fulfillment error:', error);
        res.status(500).json({ error: 'Stripe webhook fulfillment failed.' });
    }
}

const uploadDir = path.join(__dirname, '../../uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadDir),
    filename: (_req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname).toLowerCase());
    }
});

const upload = multer({
    storage,
    limits: { fileSize: FINANCE_UPLOAD_MAX_BYTES, files: 1 },
    fileFilter: (_req, file, cb) => {
        const extension = path.extname(file.originalname).toLowerCase();
        if (!ALLOWED_FINANCE_UPLOAD_MIME_TYPES.has(file.mimetype) || !ALLOWED_FINANCE_UPLOAD_EXTENSIONS.has(extension)) {
            cb(new Error('Only PDF, JPG, PNG or WebP files up to 10MB are allowed.'));
            return;
        }

        cb(null, true);
    },
});

router.get('/documents', async (req, res) => {
    try {
        const clubId = await resolveAdminFinanceClubId(req, res);
        if (clubId === null && res.headersSent) {
            return;
        }

        try {
            let query: FirebaseFirestore.Query = firestore.collection('financialDocuments');
            if (clubId !== null) {
                query = query.where('clubId', '==', clubId);
            }
            const snap = await query.orderBy('date', 'desc').get();
            const docs = snap.docs.map((docSnap) => {
                const data = docSnap.data() as {
                    id: number;
                    type: string;
                    amount: number;
                    description: string;
                    date?: FirebaseFirestore.Timestamp | Date | string | null;
                    documentUrl?: string | null;
                    status: 'pending' | 'processed' | 'rejected';
                    clubId?: number | null;
                };

                return {
                    ...data,
                    date: toIso(data.date) ?? new Date().toISOString(),
                };
            });
            res.json(docs);
        } catch (firestoreError) {
            console.error('[GET /api/finance/documents] Firestore fallback:', firestoreError);
            const docs = clubId !== null
                ? await db.select().from(pgFinancialDocuments).where(eq(pgFinancialDocuments.clubId, clubId)).orderBy(desc(pgFinancialDocuments.date))
                : await db.select().from(pgFinancialDocuments).orderBy(desc(pgFinancialDocuments.date));
            res.json(docs.map((doc) => ({
                ...doc,
                date: toIso(doc.date) ?? new Date().toISOString(),
            })));
        }
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to fetch documents' });
    }
});

router.patch('/documents/:id/status', async (req, res) => {
    const clubId = await resolveAdminFinanceClubId(req, res);
    if (clubId === null && res.headersSent) {
        return;
    }

    const id = Number(req.params.id);
    const { status } = req.body as { status?: string };

    if (!status || !['pending', 'processed', 'rejected'].includes(status)) {
        res.status(400).json({ error: 'Invalid status' });
        return;
    }

    try {
        try {
            const snap = await firestore.collection('financialDocuments').where('id', '==', id).limit(1).get();
            const docSnap = snap.docs[0];
            if (!docSnap) {
                res.status(404).json({ error: 'Document not found' });
                return;
            }

            const existing = docSnap.data() as { clubId?: number | null; status?: string };
            if (clubId !== null && existing.clubId != null && Number(existing.clubId) !== clubId) {
                res.status(403).json({ error: 'This document belongs to a different club.' });
                return;
            }

            await docSnap.ref.set({ status }, { merge: true });
            const updated = await docSnap.ref.get();
            res.json({
                ...(updated.data() as Record<string, unknown>),
                date: toIso((updated.data() as { date?: unknown }).date) ?? null,
            });
            await recordFinanceAudit({
                action: 'finance.document.status',
                entityType: 'financial_document',
                entityId: id,
                clubId,
                metadata: { store: 'firestore', previousStatus: existing.status ?? null, nextStatus: status },
                ...financeAuditActor(req),
            });
        } catch (firestoreError) {
            console.error('[PATCH /api/finance/documents/:id/status] Firestore fallback:', firestoreError);
            const existingRows = await db.select().from(pgFinancialDocuments).where(eq(pgFinancialDocuments.id, id)).limit(1);
            const existing = existingRows[0];
            if (!existing) {
                res.status(404).json({ error: 'Document not found' });
                return;
            }
            if (clubId !== null && existing.clubId != null && Number(existing.clubId) !== clubId) {
                res.status(403).json({ error: 'This document belongs to a different club.' });
                return;
            }

            const updatedRows = await db
                .update(pgFinancialDocuments)
                .set({ status: status as 'pending' | 'processed' | 'rejected' })
                .where(eq(pgFinancialDocuments.id, id))
                .returning();

            const updated = updatedRows[0];
            if (!updated) {
                res.status(404).json({ error: 'Document not found' });
                return;
            }

            res.json({
                ...updated,
                date: toIso(updated.date) ?? null,
            });
            await recordFinanceAudit({
                action: 'finance.document.status',
                entityType: 'financial_document',
                entityId: id,
                clubId,
                metadata: { store: 'postgres', previousStatus: existing.status ?? null, nextStatus: status },
                ...financeAuditActor(req),
            });
        }
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to update document status' });
    }
});

router.post('/upload', (req, res, next) => {
    upload.single('file')(req, res, (error) => {
        if (error) {
            return res.status(400).json({ error: error instanceof Error ? error.message : 'Invalid document upload.' });
        }

        next();
    });
}, async (req, res) => {
    try {
        const clubId = await resolveAdminFinanceClubId(req, res);
        if (clubId === null && res.headersSent) {
            if (req.file) {
                fs.unlink(req.file.path, () => {});
            }
            return;
        }

        if (!req.file) {
            res.status(400).json({ error: 'No file uploaded' });
            return;
        }

        const { type, amount, description } = req.body;
        const parsedAmount = normalizeMoneyValue(amount);
        const documentUrl = `/uploads/${req.file.filename}`;
        const record = {
            type: type || 'expense',
            amount: parsedAmount != null ? Math.round(parsedAmount) : 0,
            description: description || 'New Document',
            documentUrl,
            status: 'pending',
            date: new Date(),
            clubId: clubId ?? null,
        };

        try {
            const id = await nextNumericId('financialDocuments');
            await firestore.collection('financialDocuments').doc(String(id)).set({ id, ...record });

            res.json({
                id,
                ...record,
                date: new Date().toISOString(),
            });
        } catch (firestoreError) {
            console.error('[POST /api/finance/upload] Firestore fallback:', firestoreError);
            const inserted = await db.insert(pgFinancialDocuments).values({
                type: String(record.type),
                amount: record.amount,
                description: String(record.description),
                documentUrl,
                status: 'pending',
                clubId: record.clubId,
            }).returning();

            res.json({
                ...inserted[0],
                date: toIso(inserted[0].date) ?? new Date().toISOString(),
            });
        }
    } catch (error) {
        console.error('[POST /api/finance/upload] error:', error);
        if (req.file) {
            fs.unlink(req.file.path, () => {});
        }
        res.status(500).json({ error: 'Failed to upload document' });
    }
});

router.get('/player/summary', async (req, res) => {
    try {
        const currentPlayer = await getCurrentPlayer(req);
        const currency = DEFAULT_PAYMENT_CURRENCY;
        const paymentRows = await getPlayerPaymentRows(currentPlayer.data.id);
        const fees = await buildPlayerFees(currentPlayer.data, paymentRows, currency);
        const outstandingAmount = fees.reduce((sum, fee) => sum + fee.amount, 0);

        res.json({
            playerName: getPlayerName(currentPlayer.data),
            playerEmail: currentPlayer.data.email ?? null,
            billingCycle: `${formatBillingCycle()} Cycle`,
            dueLabel: buildDueLabel(fees),
            autoPayNote: 'Stripe Checkout is used for secure payments and saved cards.',
            outstandingAmount,
            currency,
            provider: 'stripe',
            stripe: {
                publishableKey: getStripePublishableKey(),
                configured: Boolean(process.env.STRIPE_SECRET_KEY?.trim()),
            },
            fees,
            paymentMethods: await listPlayerPaymentMethods(currentPlayer.data),
            transactions: buildTransactions(paymentRows, currency),
        });
    } catch (error) {
        handleRouteError(res, error, '[GET /api/finance/player/summary]');
    }
});

router.get('/stripe/config', async (req, res) => {
    const user = await requireRequestUser(req, res);
    if (!user) {
        return;
    }

    const role = normalizeRole(user.role);
    if (!['admin', 'superadmin', 'accountant'].includes(role)) {
        res.status(403).json({ error: 'Admin finance access is required.' });
        return;
    }

    const publishableKey = getStripePublishableKey();
    const secretConfigured = Boolean(process.env.STRIPE_SECRET_KEY?.trim());
    const webhookConfigured = Boolean(process.env.STRIPE_WEBHOOK_SECRET?.trim());

    res.json({
        provider: 'stripe',
        mode: publishableKey.startsWith('pk_live_') ? 'live' : 'test',
        currency: DEFAULT_PAYMENT_CURRENCY,
        configured: secretConfigured,
        secretKeyConfigured: secretConfigured,
        publishableKeyConfigured: Boolean(process.env.STRIPE_PUBLISHABLE_KEY?.trim()),
        webhookSecretConfigured: webhookConfigured,
        publishableKey,
        webhookUrl: `${getAppBaseUrl(req)}/api/finance/stripe/webhook`,
    });
});

router.get('/admin/recent-payments', async (req, res) => {
    try {
        const clubId = await resolveAdminFinanceClubId(req, res);
        if (clubId === null && res.headersSent) {
            return;
        }

        const parsedLimit = Number(req.query?.limit);
        const limit = Number.isFinite(parsedLimit) && parsedLimit > 0
            ? Math.min(Math.floor(parsedLimit), 50)
            : 12;

        const parsedTeamId = Number(req.query?.teamId);
        const teamId = Number.isFinite(parsedTeamId) && parsedTeamId > 0 ? parsedTeamId : null;

        res.json(await buildAdminRecentPayments(clubId, limit, teamId));
    } catch (error) {
        handleRouteError(res, error, '[GET /api/finance/admin/recent-payments]');
    }
});

// Record a payment made outside Stripe (e.g. a player paying cash) so it shows
// up in the team payment report alongside online payments.
router.post('/admin/manual-payment', async (req, res) => {
    try {
        const clubId = await resolveAdminFinanceClubId(req, res);
        if (clubId === null && res.headersSent) {
            return;
        }

        const body = req.body as { playerId?: unknown; amount?: unknown; description?: unknown; method?: unknown; date?: unknown };
        const playerId = Number(body.playerId);
        const amount = Number(body.amount);

        if (!Number.isFinite(playerId) || playerId <= 0) {
            res.status(400).json({ error: 'Jucătorul selectat este invalid.' });
            return;
        }
        if (!Number.isFinite(amount) || amount <= 0) {
            res.status(400).json({ error: 'Suma trebuie să fie un număr mai mare ca 0.' });
            return;
        }

        const player = await getPlayerByNumericId(playerId);
        if (!player) {
            res.status(404).json({ error: 'Jucătorul nu a fost găsit.' });
            return;
        }

        const method = (String(body.method ?? 'cash').trim().toLowerCase()) || 'cash';
        const description = typeof body.description === 'string' && body.description.trim()
            ? body.description.trim()
            : 'Plată numerar';
        const when = body.date ? (toDate(body.date) ?? new Date()) : new Date();
        const currency = DEFAULT_PAYMENT_CURRENCY;

        try {
            const id = await nextNumericId('playerPayments');
            const record = {
                id,
                playerId,
                amount: Math.round(amount),
                month: when.getMonth() + 1,
                year: when.getFullYear(),
                status: 'paid',
                date: when,
                createdAt: when,
                description,
                provider: method,
                currency,
                receiptUrl: null,
            };
            await firestore.collection('playerPayments').doc(String(id)).set(record);
            res.json({ success: true, payment: record });
            await recordFinanceAudit({
                action: 'finance.payment.manual',
                entityType: 'player_payment',
                entityId: id,
                clubId,
                metadata: {
                    store: 'firestore',
                    playerId,
                    amount: record.amount,
                    currency,
                    method,
                    month: record.month,
                    year: record.year,
                },
                ...financeAuditActor(req),
            });
        } catch (firestoreError) {
            if (!isFirestoreNotFound(firestoreError)) {
                console.error('[POST /api/finance/admin/manual-payment] Firestore fallback:', firestoreError);
            }
            const inserted = await db
                .insert(pgPlayerPayments)
                .values({
                    playerId,
                    amount: Math.round(amount),
                    month: when.getMonth() + 1,
                    year: when.getFullYear(),
                    status: 'paid',
                    date: when.toISOString(),
                    createdAt: when.toISOString(),
                })
                .returning();
            res.json({ success: true, payment: inserted[0] });
            await recordFinanceAudit({
                action: 'finance.payment.manual',
                entityType: 'player_payment',
                entityId: inserted[0]?.id ?? null,
                clubId,
                metadata: {
                    store: 'postgres',
                    playerId,
                    amount: Math.round(amount),
                    currency,
                    method,
                    month: when.getMonth() + 1,
                    year: when.getFullYear(),
                },
                ...financeAuditActor(req),
            });
        }
    } catch (error) {
        handleRouteError(res, error, '[POST /api/finance/admin/manual-payment]');
    }
});

router.post('/player/checkout-session', async (req, res) => {
    try {
        const currentPlayer = await getCurrentPlayer(req);
        const customerId = await ensureStripeCustomer(currentPlayer);
        const currency = DEFAULT_PAYMENT_CURRENCY;
        const paymentRows = await getPlayerPaymentRows(currentPlayer.data.id);
        const fees = selectedFeesFromBody(
            await buildPlayerFees(currentPlayer.data, paymentRows, currency),
            (req.body as { feeIds?: unknown })?.feeIds
        );
        const payableFees = fees.filter((fee) => fee.amount > 0);
        const totalAmount = payableFees.reduce((sum, fee) => sum + fee.amount, 0);

        if (!payableFees.length || totalAmount <= 0) {
            res.status(400).json({ error: 'There is no payable balance for this player.' });
            return;
        }

        const stripe = getStripe();
        const returnUrl = getPaymentsReturnUrl(req);
        const label = payableFees.length === 1 ? payableFees[0].label : 'Player balance payment';
        const feeIds = payableFees.map((fee) => fee.id);
        const session = await stripe.checkout.sessions.create({
            mode: 'payment',
            customer: customerId,
            line_items: payableFees.map((fee) => ({
                quantity: 1,
                price_data: {
                    currency: fee.currency,
                    unit_amount: toMinorUnits(fee.amount, fee.currency),
                    product_data: {
                        name: fee.label,
                        description: fee.description,
                    },
                },
            })),
            success_url: appendQuery(returnUrl, 'payment_session_id={CHECKOUT_SESSION_ID}'),
            cancel_url: appendQuery(returnUrl, 'payment_status=cancelled'),
            payment_intent_data: {
                setup_future_usage: 'off_session',
                metadata: {
                    source: 'player_payments',
                    playerId: String(currentPlayer.data.id),
                    feeIds: feeIds.join(','),
                    label,
                },
            },
            metadata: {
                source: 'player_payments',
                playerId: String(currentPlayer.data.id),
                feeIds: feeIds.join(','),
                label,
            },
        });

        res.json({
            id: session.id,
            url: session.url,
        });
    } catch (error) {
        handleRouteError(res, error, '[POST /api/finance/player/checkout-session]');
    }
});

router.post('/player/setup-session', async (req, res) => {
    try {
        const currentPlayer = await getCurrentPlayer(req);
        const customerId = await ensureStripeCustomer(currentPlayer);
        const stripe = getStripe();
        const returnUrl = getPaymentsReturnUrl(req);

        const session = await stripe.checkout.sessions.create({
            mode: 'setup',
            customer: customerId,
            payment_method_types: ['card'],
            success_url: appendQuery(returnUrl, 'setup_session_id={CHECKOUT_SESSION_ID}'),
            cancel_url: appendQuery(returnUrl, 'payment_status=cancelled'),
            setup_intent_data: {
                metadata: {
                    source: 'player_payment_methods',
                    playerId: String(currentPlayer.data.id),
                },
            },
            metadata: {
                source: 'player_payment_methods',
                playerId: String(currentPlayer.data.id),
            },
        });

        res.json({
            id: session.id,
            url: session.url,
        });
    } catch (error) {
        handleRouteError(res, error, '[POST /api/finance/player/setup-session]');
    }
});

router.post('/player/confirm-checkout-session', async (req, res) => {
    try {
        const currentPlayer = await getCurrentPlayer(req);
        const { sessionId } = req.body as { sessionId?: string };
        if (!sessionId) {
            res.status(400).json({ error: 'sessionId is required.' });
            return;
        }

        const stripe = getStripe();
        const session = await stripe.checkout.sessions.retrieve(sessionId);
        const sessionPlayerId = Number(session.metadata?.playerId);
        if (sessionPlayerId !== currentPlayer.data.id) {
            res.status(403).json({ error: 'This payment session does not belong to the signed-in player.' });
            return;
        }

        const fulfillment = await fulfillPaidCheckoutSession(sessionId);

        res.json({
            success: true,
            fulfillment,
        });
    } catch (error) {
        handleRouteError(res, error, '[POST /api/finance/player/confirm-checkout-session]');
    }
});

router.post('/player/confirm-setup-session', async (req, res) => {
    try {
        const currentPlayer = await getCurrentPlayer(req);
        const { sessionId } = req.body as { sessionId?: string };
        if (!sessionId) {
            res.status(400).json({ error: 'sessionId is required.' });
            return;
        }

        const stripe = getStripe();
        const session = await stripe.checkout.sessions.retrieve(sessionId);
        const sessionPlayerId = Number(session.metadata?.playerId);
        if (sessionPlayerId !== currentPlayer.data.id) {
            res.status(403).json({ error: 'This setup session does not belong to the signed-in player.' });
            return;
        }

        if (session.mode !== 'setup' || session.status !== 'complete') {
            res.status(400).json({ error: 'Stripe setup session is not complete yet.' });
            return;
        }

        res.json({
            success: true,
            paymentMethods: await listPlayerPaymentMethods(currentPlayer.data),
        });
    } catch (error) {
        handleRouteError(res, error, '[POST /api/finance/player/confirm-setup-session]');
    }
});

router.get('/settings', async (req, res) => {
    try {
        const user = await requireRequestUser(req, res);
        if (!user) {
            return;
        }

        const clubId = user?.clubId != null ? Number(user.clubId) : null;
        const data = await getSettingsData(clubId);

        res.json({
            ...data,
            id: data.id ?? clubId ?? 1,
            clubId: data.clubId ?? clubId,
            monthlyPlayerFee: normalizeMoneyValue(data.monthlyPlayerFee) ?? 0,
            trainingLevy: normalizeMoneyValue(data.trainingLevy) ?? 0,
            facilityFee: normalizeMoneyValue(data.facilityFee) ?? 0,
            autoAdjust: Number(data.autoAdjust ?? 1) ? 1 : 0,
            paymentDueDay: resolveDueDay(data.paymentDueDay),
            updatedAt: toIso(data.updatedAt) ?? new Date().toISOString(),
        });
    } catch (error) {
        console.error('[GET /api/finance/settings]', error);
        res.status(500).json({ error: 'Failed to load settings' });
    }
});

router.patch('/settings', async (req, res) => {
    try {
        const clubId = await resolveAdminFinanceClubId(req, res);
        if (clubId === null && res.headersSent) {
            return;
        }

        const { monthlyPlayerFee, trainingLevy, facilityFee, autoAdjust, paymentDueDay } = req.body;
        const updates: Record<string, unknown> = {
            id: clubId ?? 1,
            clubId: clubId ?? null,
            updatedAt: new Date(),
        };

        if (paymentDueDay !== undefined) {
            const day = normalizeDueDay(paymentDueDay);
            if (day == null) {
                res.status(400).json({ error: 'paymentDueDay must be a day between 1 and 31.' });
                return;
            }
            updates.paymentDueDay = day;
        }

        if (monthlyPlayerFee !== undefined) {
            const amount = normalizeMoneyValue(monthlyPlayerFee);
            if (amount == null) {
                res.status(400).json({ error: 'monthlyPlayerFee must be a positive number or zero.' });
                return;
            }
            updates.monthlyPlayerFee = amount;
        }

        if (trainingLevy !== undefined) {
            const amount = normalizeMoneyValue(trainingLevy);
            if (amount == null) {
                res.status(400).json({ error: 'trainingLevy must be a positive number or zero.' });
                return;
            }
            updates.trainingLevy = amount;
        }

        if (facilityFee !== undefined) {
            const amount = normalizeMoneyValue(facilityFee);
            if (amount == null) {
                res.status(400).json({ error: 'facilityFee must be a positive number or zero.' });
                return;
            }
            updates.facilityFee = amount;
        }

        if (autoAdjust !== undefined) {
            updates.autoAdjust = Number(autoAdjust) ? 1 : 0;
        }

        try {
            const ref = firestore.collection('financialSettings').doc(getSettingsDocId(clubId));
            await ensureSettings(clubId);
            // Captured before the write so the audit row can carry what the fees were,
            // which is the evidence this endpoint has never produced.
            const beforeSnap = await ref.get();
            const before = beforeSnap.data() as FinancialSettingsDoc | undefined;
            await ref.set(updates, { merge: true });

            const snap = await ref.get();
            const data = snap.data() as FinancialSettingsDoc;
            res.json({
                ...data,
                monthlyPlayerFee: normalizeMoneyValue(data.monthlyPlayerFee) ?? 0,
                trainingLevy: normalizeMoneyValue(data.trainingLevy) ?? 0,
                facilityFee: normalizeMoneyValue(data.facilityFee) ?? 0,
                autoAdjust: Number(data.autoAdjust ?? 1) ? 1 : 0,
                paymentDueDay: resolveDueDay(data.paymentDueDay),
                updatedAt: toIso(data.updatedAt as any) ?? new Date().toISOString(),
            });
            await recordFinanceAudit({
                action: 'finance.settings.update',
                entityType: 'financial_settings',
                entityId: clubId,
                clubId,
                metadata: { store: 'firestore', changes: settingsAuditChanges(before, updates) },
                ...financeAuditActor(req),
            });
            return;
        } catch (error) {
            if (!isFirestoreNotFound(error)) {
                console.error('[PATCH /api/finance/settings] Firestore settings fallback:', error);
            }
        }

        const pgUpdates: Partial<typeof pgFinancialSettings.$inferInsert> = {
            ...(updates.monthlyPlayerFee !== undefined ? { monthlyPlayerFee: Number(updates.monthlyPlayerFee) } : {}),
            ...(updates.trainingLevy !== undefined ? { trainingLevy: Number(updates.trainingLevy) } : {}),
            ...(updates.facilityFee !== undefined ? { facilityFee: Number(updates.facilityFee) } : {}),
            ...(updates.autoAdjust !== undefined ? { autoAdjust: Number(updates.autoAdjust) } : {}),
            ...(updates.paymentDueDay !== undefined ? { paymentDueDay: Number(updates.paymentDueDay) } : {}),
            updatedAt: new Date().toISOString(),
        };
        // Must use the same key as getSettingsData, which now reads by club id. Left
        // hardcoded to 1, a club would write its fees into the legacy row and then read
        // back its own (empty) row — silently losing every settings change.
        const settingsRowId = clubId ?? DEFAULT_SETTINGS_ROW_ID;
        const existingRows = await db.select().from(pgFinancialSettings).where(eq(pgFinancialSettings.id, settingsRowId)).limit(1);
        const data = existingRows[0]
            ? (await db.update(pgFinancialSettings).set(pgUpdates).where(eq(pgFinancialSettings.id, settingsRowId)).returning())[0]
            : (await db.insert(pgFinancialSettings).values({
                id: settingsRowId,
                monthlyPlayerFee: Number(updates.monthlyPlayerFee ?? 0),
                trainingLevy: Number(updates.trainingLevy ?? 0),
                facilityFee: Number(updates.facilityFee ?? 0),
                autoAdjust: Number(updates.autoAdjust ?? 1),
                paymentDueDay: Number(updates.paymentDueDay ?? DEFAULT_PAYMENT_DUE_DAY),
                updatedAt: new Date().toISOString(),
            }).returning())[0];
        res.json({
            ...data,
            monthlyPlayerFee: normalizeMoneyValue(data.monthlyPlayerFee) ?? 0,
            trainingLevy: normalizeMoneyValue(data.trainingLevy) ?? 0,
            facilityFee: normalizeMoneyValue(data.facilityFee) ?? 0,
            autoAdjust: Number(data.autoAdjust ?? 1) ? 1 : 0,
            paymentDueDay: resolveDueDay(data.paymentDueDay),
            updatedAt: toIso(data.updatedAt as any) ?? new Date().toISOString(),
        });
        await recordFinanceAudit({
            action: 'finance.settings.update',
            entityType: 'financial_settings',
            entityId: settingsRowId,
            clubId,
            metadata: { store: 'postgres', changes: settingsAuditChanges(existingRows[0], updates) },
            ...financeAuditActor(req),
        });
    } catch (error) {
        console.error('[PATCH /api/finance/settings]', error);
        res.status(500).json({ error: 'Failed to update settings' });
    }
});

export default router;
