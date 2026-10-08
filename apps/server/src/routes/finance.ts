import { Router, type Request, type Response } from 'express';
import multer from 'multer';
import path from 'path';
import Stripe from 'stripe';
import { toDate, toIso } from '../lib/dateUtils';
import { verifyBearerToken } from '../lib/clerkAuth';
import { requireRequestUser } from '../lib/requestContext';
import { normalizeRole } from '../lib/requestAuth';
import { DEFAULT_PAYMENT_DUE_DAY, DEFAULT_SETTINGS_ROW_ID } from '../lib/financeDefaults';
import { authenticate, type AuthenticatedRequest } from '../middleware/auth';
import { writeAuditLog, type AuditLogInput } from '../services/auditService';
import { requestedChildId, resolveSelfPlayer } from '../lib/selfPlayer';
import { saveStoredFile, sniffMime } from '../lib/storedFiles';
import { db } from '../db';
import {
    financialDocuments as pgFinancialDocuments,
    financialSettings as pgFinancialSettings,
    playerPayments as pgPlayerPayments,
    players as pgPlayers,
    playersToTeams as pgPlayersToTeams,
    storedFiles as pgStoredFiles,
    teams as pgTeams,
    users as pgUsers,
} from '../db/schema';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import {
    isFailedStatus,
    isOutstandingStatus,
    isPaidStatus,
    monthKey,
    parseFeeIds,
    safeReturnUrl,
    serializeFeeIds,
} from '../lib/paymentLedger';
import { createAllowedOrigins, isOriginAllowed } from '../lib/corsOrigins';
import { roundMoney } from '../lib/money';
import { isValidBillingMonth, type ComputedFee } from '../lib/feeSchedule';
import { clubBalances, clubPlayers, collectedInRange, getClubFeeSettings, playerFees } from '../services/clubFinance';
import { notifyPaymentRecorded } from '../lib/notifications';

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
    'billingStartMonth',
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
    status?: string | null;
    createdAt?: string | null;
};

type FinancialSettingsDoc = {
    id: number;
    clubId?: number | null;
    monthlyPlayerFee?: number;
    trainingLevy?: number;
    facilityFee?: number;
    autoAdjust?: number;
    paymentDueDay?: number;
    billingStartMonth?: string | null;
    updatedAt?: Date | string | null;
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
    date?: Date | string | null;
    createdAt?: Date | string | null;
    stripeCheckoutSessionId?: string | null;
    stripePaymentIntentId?: string | null;
    receiptUrl?: string | null;
    feeIds?: string | string[] | null;
    paidByUserId?: number | null;
};

type PlayerPaymentFee = {
    id: string;
    label: string;
    description: string;
    amount: number;
    currency: string;
    status: ComputedFee['status'];
    dueDate: string | null;
    icon: 'training' | 'trophy' | 'receipt';
    paymentId?: number | string | null;
};

type CurrentPlayer = {
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

function getPlayerName(player: PlayerDoc) {
    const fromParts = `${player.firstName ?? ''} ${player.lastName ?? ''}`.trim();
    return player.name || fromParts || player.email || 'Player';
}

function formatBillingCycle(date = new Date()) {
    return new Intl.DateTimeFormat('ro-RO', { month: 'long', year: 'numeric' }).format(date);
}

function monthName(month?: number | null, year?: number | null) {
    if (!month || !year) {
        return 'Cotizație';
    }

    return `Cotizație ${new Intl.DateTimeFormat('ro-RO', { month: 'long', year: 'numeric' }).format(new Date(year, month - 1, 1))}`;
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

const RETURN_URL_ORIGINS = createAllowedOrigins(process.env);

function getPaymentsReturnUrl(req: Request) {
    const requested = (req.body as { returnUrl?: unknown } | undefined)?.returnUrl;
    return safeReturnUrl(
        requested,
        `${getAppBaseUrl(req)}/payments`,
        (origin) => isOriginAllowed(origin, RETURN_URL_ORIGINS, process.env),
    );
}

async function getRequesterEmail(req: Request) {
    const header = req.header('authorization') || '';
    const token = header.match(/^Bearer\s+(.+)$/i)?.[1];
    if (!token) {
        return null;
    }

    const decoded = await verifyBearerToken(token);
    return decoded.email ?? null;
}

async function getCurrentPlayer(req: Request): Promise<CurrentPlayer> {
    const email = await getRequesterEmail(req);
    if (!email) {
        throw Object.assign(new Error('Trebuie să fii autentificat ca să vezi plățile.'), { statusCode: 401 });
    }

    const userRows = await db
        .select()
        .from(pgUsers)
        .where(sql`lower(${pgUsers.email}) = ${email.trim().toLowerCase()}`)
        .limit(1);
    const user = userRows[0];
    // A parent pays for their selected child; a player for themselves (lib/selfPlayer.ts).
    const player = user?.role === 'parent'
        ? await resolveSelfPlayer(user, requestedChildId(req))
        : (await db
            .select()
            .from(pgPlayers)
            .where(sql`lower(trim(${pgPlayers.email})) = ${email.trim().toLowerCase()}`)
            .orderBy(pgPlayers.id)
            .limit(1))[0];

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
                status: createdPlayer.status,
                createdAt: createdPlayer.createdAt,
            },
        };
    }

    if (!player) {
        throw Object.assign(new Error(user?.role === 'parent'
            ? 'Contul tău nu este încă legat de niciun copil.'
            : 'Nu am găsit profilul de jucător al acestui cont.'), { statusCode: 404 });
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
            status: player.status,
            createdAt: player.createdAt,
        },
    };
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

async function getSettingsData(clubId?: number | null) {
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
            billingStartMonth: null as string | null,
            updatedAt: new Date(),
        };
    }

    // Found by the row's own club_id (services/clubFinance.ts). Rows used to be
    // looked up by `id = club id`, which nothing enforced.
    const row = await getClubFeeSettings(clubId);
    return {
        id: row.id,
        clubId,
        monthlyPlayerFee: row.monthlyPlayerFee,
        trainingLevy: row.trainingLevy,
        facilityFee: row.facilityFee,
        autoAdjust: row.autoAdjust,
        paymentDueDay: resolveDueDay(row.paymentDueDay),
        billingStartMonth: row.billingStartMonth ?? null,
        updatedAt: row.updatedAt,
    };
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

    await addMembershipsFromPostgres();
    return ids;
}

async function getPlayerPaymentRows(playerId: number) {
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
            paidByUserId: row.paidByUserId ?? null,
            stripeCheckoutSessionId: row.stripeSessionId ?? null,
            feeIds: row.feeIds ?? null,
            description: row.description ?? null,
        } satisfies PlayerPaymentDoc,
    }));
}

async function getPlayerByNumericId(playerId: number) {
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
            status: player.status,
            createdAt: player.createdAt,
        } satisfies PlayerDoc
        : null;
}

/**
 * What the player owes — the shared calculation in lib/feeSchedule.ts (via
 * services/clubFinance.ts), so this page and the club's balances agree.
 */
async function buildPlayerFees(player: PlayerDoc, currency: string): Promise<PlayerPaymentFee[]> {
    const clubId = await getPlayerClubId(player);
    const { fees } = await playerFees({
        id: player.id,
        teamId: player.teamId ?? null,
        createdAt: player.createdAt ?? null,
        status: player.status ?? null,
    }, clubId);
    return fees.map((fee) => ({
        id: fee.id,
        label: fee.label,
        description: fee.description,
        amount: fee.amount,
        currency,
        status: fee.status,
        dueDate: fee.dueDate,
        icon: fee.icon,
        paymentId: fee.paymentId ?? null,
    }));
}

function buildTransactions(paymentRows: Array<{ data: PlayerPaymentDoc }>, currency: string, payerNames = new Map<number, string>()) {
    return paymentRows
        .filter(({ data }) => isPaidStatus(data.status) || isFailedStatus(data.status))
        .sort((a, b) => (toDate(b.data.date ?? b.data.createdAt)?.getTime() ?? 0) - (toDate(a.data.date ?? a.data.createdAt)?.getTime() ?? 0))
        .slice(0, 12)
        .map(({ data }) => ({
            id: String(data.id ?? data.stripeCheckoutSessionId ?? `${data.month}-${data.year}`),
            label: data.description || monthName(data.month, data.year),
            description: data.paidByUserId != null && payerNames.has(data.paidByUserId)
                ? `Plătit de ${payerNames.get(data.paidByUserId)}`
                : data.stripeCheckoutSessionId ? 'Plată online' : 'Înregistrată de club',
            paidByName: data.paidByUserId != null ? payerNames.get(data.paidByUserId) ?? null : null,
            amount: asPositiveAmount(data.amount),
            currency: data.currency || currency,
            status: isPaidStatus(data.status) ? 'success' : 'error',
            date: toIso(data.date ?? data.createdAt) ?? new Date().toISOString(),
            receiptUrl: data.receiptUrl ?? null,
        }));
}

/** Who paid online, for "Plătit de …" — a player and their parents share one history. */
async function payerNamesFor(paymentRows: Array<{ data: PlayerPaymentDoc }>) {
    const ids = Array.from(new Set(paymentRows.map(({ data }) => data.paidByUserId).filter((id): id is number => id != null)));
    if (!ids.length) return new Map<number, string>();
    const rows = await db.select({ id: pgUsers.id, name: pgUsers.name }).from(pgUsers).where(inArray(pgUsers.id, ids));
    return new Map(rows.map((row) => [row.id, row.name]));
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
        // A voided request was settled by a later payment, which is listed itself.
        .filter((payment) => normalizeStatus(payment.status) !== 'void')
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
                description: payment.description || monthName(payment.month, payment.year),
                provider: payment.stripeSessionId ? 'stripe' : payment.method ?? null,
                receiptUrl: null,
            } satisfies AdminRecentPayment;
        });

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
        return 'Achitat';
    }

    if (fees.some((fee) => fee.status === 'overdue')) {
        return 'Restanță';
    }

    const dueTimes = fees
        .map((fee) => toDate(fee.dueDate)?.getTime() ?? null)
        .filter((value): value is number => value != null)
        .sort((a, b) => a - b);

    if (!dueTimes.length) {
        return 'Scadent luna aceasta';
    }

    const diffDays = Math.ceil((dueTimes[0] - Date.now()) / 86400000);
    if (diffDays <= 0) {
        return 'Scadent acum';
    }

    return diffDays === 1 ? 'Scadent mâine' : `Scadent în ${diffDays} zile`;
}

type Payer = { id: number; email: string; name: string; stripeCustomerId: string | null };

/** The signed-in account paying — a player for themselves, or a parent for their child. */
async function getPayer(req: Request): Promise<Payer> {
    const user = (req as AuthenticatedRequest).user;
    if (!user?.id) {
        throw Object.assign(new Error('Trebuie să fii autentificat ca să plătești.'), { statusCode: 401 });
    }
    return { id: Number(user.id), email: user.email, name: user.name, stripeCustomerId: user.stripeCustomerId ?? null };
}

async function listPayerPaymentMethods(payer: Payer) {
    const stripe = getStripeIfConfigured();
    if (!stripe || !payer.stripeCustomerId) {
        return [];
    }

    try {
        const methods = await stripe.paymentMethods.list({
            customer: payer.stripeCustomerId,
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
        console.error('[finance] Stripe payment methods error:', error);
        return [];
    }
}

/**
 * The payer's Stripe customer, created once and stored on the account. It was
 * never persisted before, so every checkout made a new customer and saved
 * cards never came back. A stored id Stripe no longer knows (deleted, or the
 * keys moved from test to live) is replaced.
 */
async function ensureStripeCustomer(payer: Payer) {
    const stripe = getStripe();
    if (payer.stripeCustomerId) {
        try {
            const existing = await stripe.customers.retrieve(payer.stripeCustomerId);
            if (!(existing as { deleted?: boolean }).deleted) {
                return payer.stripeCustomerId;
            }
        } catch (error: any) {
            if (error?.code !== 'resource_missing') throw error;
        }
    }

    const customer = await stripe.customers.create({
        email: payer.email || undefined,
        name: payer.name || undefined,
        metadata: { userId: String(payer.id) },
    });
    await db.update(pgUsers).set({ stripeCustomerId: customer.id }).where(eq(pgUsers.id, payer.id));
    payer.stripeCustomerId = customer.id;
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
async function recordCheckoutPayment(params: CheckoutPaymentRecord) {
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
            notifyPaymentRecorded(params.playerId, params.amount, params.label).catch((error) => console.error('[finance] payment notification failed:', error));
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
async function voidSettledRequests(playerId: number, feeIds: string[]) {
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

function feeIdMetadata(feeIds: string[]) {
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

function sessionFeeIds(session: { metadata?: Record<string, string> | null }) {
    const metadata = session.metadata ?? {};
    const parts = [metadata.feeIds];
    for (let index = 1; metadata[`feeIds_${index}`]; index += 1) parts.push(metadata[`feeIds_${index}`]);
    return parseFeeIds(parts.filter(Boolean).join(','));
}

async function markCheckoutSessionFailed(sessionId: string, reason: 'failed' | 'expired') {
    // An expired session is a checkout the payer abandoned. It moved no money
    // and changes nothing they owe; recording it as a failed payment used to
    // show up as a brand-new debt for the whole basket.
    if (reason === 'expired') {
        return { recorded: false, reason: 'checkout_session_expired' };
    }

    const stripe = getStripe();
    const session = await stripe.checkout.sessions.retrieve(sessionId);

    if (session.mode !== 'payment') {
        return {
            recorded: false,
            reason: 'checkout_session_not_payment_mode',
        };
    }

    const playerId = Number(session.metadata?.playerId);
    if (!Number.isFinite(playerId)) {
        throw new Error(`Stripe session ${session.id} is missing playerId metadata.`);
    }

    const currency = (session.currency || DEFAULT_PAYMENT_CURRENCY).toLowerCase();
    const result = await recordCheckoutPayment({
        playerId,
        sessionId: session.id,
        status: 'failed',
        amount: fromMinorUnits(session.amount_total, currency),
        feeIds: sessionFeeIds(session),
        label: session.metadata?.label || 'Plată online',
        paidByUserId: Number(session.metadata?.payerUserId) || null,
    });

    return { recorded: !result.duplicate, payment: result.payment };
}

async function fulfillPaidCheckoutSession(sessionId: string) {
    const stripe = getStripe();
    const session = await stripe.checkout.sessions.retrieve(sessionId);

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
    // The fees the payer chose are in the session's metadata (set when it was
    // created). Sessions made before that have none: fall back to what was due.
    let feeIds = sessionFeeIds(session);
    if (!feeIds.length) {
        feeIds = (await buildPlayerFees(player, currency)).map((fee) => fee.id);
    }

    const result = await recordCheckoutPayment({
        playerId: player.id,
        sessionId: session.id,
        status: 'paid',
        amount: fromMinorUnits(session.amount_total, currency),
        feeIds,
        label: session.metadata?.label || 'Plată online',
        paidByUserId: Number(session.metadata?.payerUserId) || null,
    });

    return {
        fulfilled: true,
        duplicate: result.duplicate,
        payment: result.payment,
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

// Memory, not disk: the API host's disk is wiped on every deploy, so documents
// live in Postgres (lib/storedFiles.ts) and open through /api/files signed links.
const upload = multer({
    storage: multer.memoryStorage(),
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

        const docs = clubId !== null
            ? await db.select().from(pgFinancialDocuments).where(eq(pgFinancialDocuments.clubId, clubId)).orderBy(desc(pgFinancialDocuments.date))
            : await db.select().from(pgFinancialDocuments).orderBy(desc(pgFinancialDocuments.date));
        res.json(docs.map((doc) => ({
            ...doc,
            date: toIso(doc.date) ?? new Date().toISOString(),
        })));
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
    const { status, reason } = req.body as { status?: string; reason?: unknown };

    if (!status || !['pending', 'processed', 'rejected'].includes(status)) {
        res.status(400).json({ error: 'Invalid status' });
        return;
    }
    const reasonText = typeof reason === 'string' ? reason.trim().slice(0, 500) : '';

    try {
        const existingRows = await db.select().from(pgFinancialDocuments).where(eq(pgFinancialDocuments.id, id)).limit(1);
        const existing = existingRows[0];
        if (!existing) {
            res.status(404).json({ error: 'Document not found' });
            return;
        }
        // Documents with no club (pre-tenancy rows) are superadmin-only.
        if (clubId !== null && Number(existing.clubId) !== clubId) {
            res.status(403).json({ error: 'This document belongs to a different club.' });
            return;
        }

        const transition = documentTransitionError(existing.status, status, reasonText);
        if (transition) {
            res.status(400).json({ error: transition });
            return;
        }

        // Four eyes: whoever uploaded a document does not approve it — unless
        // nobody else in the club could (a one-person finance team).
        if (status === 'processed') {
            const actorId = Number((req as AuthenticatedRequest).user?.id);
            const uploaderId = await documentUploaderId(existing.documentUrl);
            if (uploaderId != null && uploaderId === actorId && clubId !== null && await hasOtherFinanceReviewer(clubId, actorId)) {
                res.status(403).json({ error: 'Un document trebuie aprobat de altă persoană decât cea care l-a încărcat.' });
                return;
            }
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
            metadata: { previousStatus: existing.status ?? null, nextStatus: status, reason: reasonText || null },
            ...financeAuditActor(req),
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to update document status' });
    }
});

/**
 * Allowed moves: pending → processed/rejected (rejecting needs a reason), and
 * back to pending to reopen a decided document (also with a reason). A decided
 * document no longer jumps straight to the opposite decision.
 */
function documentTransitionError(current: string | null, next: string, reason: string) {
    const from = normalizeStatus(current) || 'pending';
    if (from === next) return 'Documentul are deja acest status.';
    if (from === 'pending') {
        return next === 'rejected' && !reason ? 'Scrie motivul respingerii.' : null;
    }
    if (next === 'pending') {
        return reason ? null : 'Scrie motivul redeschiderii documentului.';
    }
    return 'Redeschide documentul înainte de a schimba decizia.';
}

/** Who uploaded the file behind a finance document (/api/files/<key>). */
async function documentUploaderId(documentUrl: string | null) {
    const key = documentUrl?.match(/^\/api\/files\/([a-f0-9]{32})$/)?.[1];
    if (!key) return null;
    const [file] = await db.select({ uploadedBy: pgStoredFiles.uploadedBy }).from(pgStoredFiles).where(eq(pgStoredFiles.key, key)).limit(1);
    return file?.uploadedBy ?? null;
}

async function hasOtherFinanceReviewer(clubId: number, actorId: number) {
    const rows = await db
        .select({ id: pgUsers.id })
        .from(pgUsers)
        .where(and(
            eq(pgUsers.clubId, clubId),
            inArray(pgUsers.role, ['admin', 'accountant']),
            eq(pgUsers.status, 'active'),
            sql`${pgUsers.id} <> ${actorId}`,
        ))
        .limit(1);
    return rows.length > 0;
}

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
            return;
        }

        if (!req.file) {
            res.status(400).json({ error: 'No file uploaded' });
            return;
        }

        const mimeType = sniffMime(req.file.buffer);
        if (!mimeType || !ALLOWED_FINANCE_UPLOAD_MIME_TYPES.has(mimeType)) {
            res.status(400).json({ error: 'Only PDF, JPG, PNG or WebP files up to 10MB are allowed.' });
            return;
        }

        const { type, amount, description } = req.body;
        const parsedAmount = normalizeMoneyValue(amount);
        const key = await saveStoredFile({
            buffer: req.file.buffer,
            mimeType,
            fileName: Buffer.from(req.file.originalname, 'latin1').toString('utf8'),
            kind: 'finance_doc',
            isPublic: false,
            clubId: clubId ?? null,
            uploadedBy: (req as AuthenticatedRequest).user?.id ?? null,
        });
        // Private: opened through POST /api/files/:key/link (signed, 5 minutes).
        const documentUrl = `/api/files/${key}`;
        const record = {
            type: type || 'expense',
            amount: parsedAmount != null ? roundMoney(parsedAmount) : 0,
            description: description || 'New Document',
            documentUrl,
            status: 'pending',
            date: new Date(),
            clubId: clubId ?? null,
        };

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
    } catch (error) {
        console.error('[POST /api/finance/upload] error:', error);
        res.status(500).json({ error: 'Failed to upload document' });
    }
});

router.get('/player/summary', async (req, res) => {
    try {
        const currentPlayer = await getCurrentPlayer(req);
        const currency = DEFAULT_PAYMENT_CURRENCY;
        const [paymentRows, fees] = await Promise.all([
            getPlayerPaymentRows(currentPlayer.data.id),
            buildPlayerFees(currentPlayer.data, currency),
        ]);
        const outstandingAmount = fees.reduce((sum, fee) => sum + fee.amount, 0);

        res.json({
            playerName: getPlayerName(currentPlayer.data),
            playerEmail: currentPlayer.data.email ?? null,
            billingCycle: `Ciclul ${formatBillingCycle()}`,
            dueLabel: buildDueLabel(fees),
            autoPayNote: 'Plățile și cardurile salvate sunt procesate securizat prin Stripe.',
            outstandingAmount,
            currency,
            provider: 'stripe',
            stripe: {
                publishableKey: getStripePublishableKey(),
                configured: Boolean(process.env.STRIPE_SECRET_KEY?.trim()),
            },
            fees,
            paymentMethods: await listPayerPaymentMethods(await getPayer(req)),
            transactions: buildTransactions(paymentRows, currency, await payerNamesFor(paymentRows)),
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

/**
 * What every player owes — the same calculation as the player's own Plăți
 * page. Optional ?teamId= narrows it to one squad.
 */
router.get('/admin/balances', async (req, res) => {
    try {
        const clubId = await resolveAdminFinanceClubId(req, res);
        if (clubId === null) {
            if (!res.headersSent) res.json({ currency: DEFAULT_PAYMENT_CURRENCY, players: [] });
            return;
        }
        const parsedTeamId = Number(req.query?.teamId);
        const teamId = Number.isFinite(parsedTeamId) && parsedTeamId > 0 ? parsedTeamId : null;
        const balances = await clubBalances(clubId, { teamId });
        res.json({
            currency: DEFAULT_PAYMENT_CURRENCY,
            players: balances
                .sort((a, b) => b.overdue - a.overdue || b.outstanding - a.outstanding || a.playerName.localeCompare(b.playerName))
                .map(({ fees, ...rest }) => ({ ...rest, fees: fees.map((fee) => ({ ...fee, currency: DEFAULT_PAYMENT_CURRENCY })) })),
        });
    } catch (error) {
        handleRouteError(res, error, '[GET /api/finance/admin/balances]');
    }
});

/**
 * Every payment of the club in a date range (?from=YYYY-MM-DD&to=YYYY-MM-DD,
 * default: this month) for the accountant's CSV export — paid, failed and
 * voided rows alike, with method, note and the fees each one settled.
 */
router.get('/admin/payments-export', async (req, res) => {
    try {
        const clubId = await resolveAdminFinanceClubId(req, res);
        if (clubId === null) {
            if (!res.headersSent) res.status(400).json({ error: 'Alege un club.' });
            return;
        }
        const parseDay = (value: unknown) => (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00`) : null);
        const now = new Date();
        const from = parseDay(req.query.from) ?? new Date(now.getFullYear(), now.getMonth(), 1);
        const toDay = parseDay(req.query.to) ?? new Date(now.getFullYear(), now.getMonth() + 1, 0);
        const to = new Date(toDay.getFullYear(), toDay.getMonth(), toDay.getDate(), 23, 59, 59, 999);
        if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from > to) {
            res.status(400).json({ error: 'Perioada este invalidă.' });
            return;
        }

        const roster = await clubPlayers(clubId);
        const byId = new Map(roster.map((entry) => [entry.player.id, entry]));
        const ids = roster.map((entry) => entry.player.id);
        const rows = ids.length
            ? await db.select().from(pgPlayerPayments).where(and(
                inArray(pgPlayerPayments.playerId, ids),
                sql`${pgPlayerPayments.date} >= ${from.toISOString()}`,
                sql`${pgPlayerPayments.date} <= ${to.toISOString()}`,
            )).orderBy(desc(pgPlayerPayments.date)).limit(5000)
            : [];
        res.json({
            currency: DEFAULT_PAYMENT_CURRENCY,
            from: from.toISOString(),
            to: to.toISOString(),
            payments: rows.map((row) => {
                const entry = byId.get(row.playerId);
                return {
                    id: row.id,
                    date: toIso(row.date) ?? toIso(row.createdAt),
                    playerId: row.playerId,
                    playerName: entry ? getPlayerName(entry.player) : `Jucător #${row.playerId}`,
                    teamName: entry?.teamName ?? null,
                    amount: Number(row.amount) || 0,
                    status: row.status,
                    method: row.stripeSessionId ? 'card online' : row.method ?? null,
                    description: row.description ?? monthName(row.month, row.year),
                    feeIds: parseFeeIds(row.feeIds),
                };
            }),
        });
    } catch (error) {
        handleRouteError(res, error, '[GET /api/finance/admin/payments-export]');
    }
});

/**
 * The club's money for one month (?month=YYYY-MM, default: this month):
 * collected = paid rows dated in that month; owed = today's balances.
 * The Finanțe header and the dashboard both read these definitions.
 */
router.get('/admin/summary', async (req, res) => {
    try {
        const clubId = await resolveAdminFinanceClubId(req, res);
        if (clubId === null) {
            if (!res.headersSent) res.status(400).json({ error: 'Alege un club.' });
            return;
        }
        const now = new Date();
        const requested = typeof req.query?.month === 'string' && isValidBillingMonth(req.query.month) ? req.query.month : null;
        const [year, month] = requested ? requested.split('-').map(Number) : [now.getFullYear(), now.getMonth() + 1];
        const start = new Date(year, month - 1, 1);
        const end = new Date(year, month, 0, 23, 59, 59, 999);

        const [roster, balances] = await Promise.all([clubPlayers(clubId), clubBalances(clubId, { now })]);
        const collected = await collectedInRange(roster.map((entry) => entry.player.id), start, end);
        res.json({
            currency: DEFAULT_PAYMENT_CURRENCY,
            month: monthKey(year, month),
            collected,
            outstanding: balances.reduce((sum, row) => sum + row.outstanding, 0),
            overdue: balances.reduce((sum, row) => sum + row.overdue, 0),
            playersOverdue: balances.filter((row) => row.state === 'overdue').length,
            playersOwing: balances.filter((row) => row.outstanding > 0).length,
        });
    } catch (error) {
        handleRouteError(res, error, '[GET /api/finance/admin/summary]');
    }
});

const MANUAL_PAYMENT_METHODS = new Set(['cash', 'transfer', 'card', 'other']);
const FEE_ID_PATTERN = /^(?:(?:monthly|levy|facility):\d{4}-\d{2}|(?:event|payment):\d+)$/;

// Record a payment made outside Stripe (e.g. a player paying cash) so it shows
// up in the team payment report alongside online payments.
router.post('/admin/manual-payment', async (req, res) => {
    try {
        const clubId = await resolveAdminFinanceClubId(req, res);
        if (clubId === null && res.headersSent) {
            return;
        }

        const body = req.body as { playerId?: unknown; amount?: unknown; description?: unknown; method?: unknown; date?: unknown; feeIds?: unknown };
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

        // The id came from the client: the player must belong to the caller's
        // club, or an admin could write payments onto another club's books.
        if (clubId !== null && await getPlayerClubId(player) !== clubId) {
            res.status(404).json({ error: 'Jucătorul nu a fost găsit.' });
            return;
        }

        const method = MANUAL_PAYMENT_METHODS.has(String(body.method ?? '').trim().toLowerCase())
            ? String(body.method).trim().toLowerCase()
            : 'cash';
        const description = typeof body.description === 'string' && body.description.trim()
            ? body.description.trim().slice(0, 500)
            : 'Plată numerar';
        const when = body.date ? toDate(body.date) : new Date();
        if (!when) {
            res.status(400).json({ error: 'Data plății este invalidă.' });
            return;
        }
        // Money cannot arrive in the future; a typo in the year would otherwise
        // book the payment into a month nobody is looking at.
        if (when.getTime() > Date.now() + 24 * 60 * 60 * 1000) {
            res.status(400).json({ error: 'Data plății nu poate fi în viitor.' });
            return;
        }
        const currency = DEFAULT_PAYMENT_CURRENCY;
        // The fees this payment settles, picked in Finanțe → Restanțe. Without a
        // list (older clients, the team report) a desk payment is the monthly fee
        // of the month it is dated in — what the app assumed before fee ids.
        const requestedFeeIds = parseFeeIds(body.feeIds).filter((id) => FEE_ID_PATTERN.test(id));
        const feeIds = requestedFeeIds.length
            ? requestedFeeIds
            : [`monthly:${monthKey(when.getFullYear(), when.getMonth() + 1)}`];

        const inserted = await db
            .insert(pgPlayerPayments)
            .values({
                playerId,
                amount: roundMoney(amount),
                month: when.getMonth() + 1,
                year: when.getFullYear(),
                status: 'paid',
                date: when.toISOString(),
                createdAt: new Date().toISOString(),
                paidByUserId: null,
                feeIds: serializeFeeIds(feeIds),
                method,
                description,
            })
            .returning();
        await voidSettledRequests(playerId, feeIds);
        res.json({ success: true, payment: inserted[0] });
        notifyPaymentRecorded(playerId, amount, description).catch((error) => console.error('[finance] payment notification failed:', error));
        await recordFinanceAudit({
            action: 'finance.payment.manual',
            entityType: 'player_payment',
            entityId: inserted[0]?.id ?? null,
            clubId,
            metadata: {
                playerId,
                amount: roundMoney(amount),
                currency,
                method,
                description,
                feeIds,
                month: when.getMonth() + 1,
                year: when.getFullYear(),
            },
            ...financeAuditActor(req),
        });
    } catch (error) {
        handleRouteError(res, error, '[POST /api/finance/admin/manual-payment]');
    }
});

router.post('/player/checkout-session', async (req, res) => {
    try {
        const currentPlayer = await getCurrentPlayer(req);
        const customerId = await ensureStripeCustomer(await getPayer(req));
        const currency = DEFAULT_PAYMENT_CURRENCY;
        const fees = selectedFeesFromBody(
            await buildPlayerFees(currentPlayer.data, currency),
            (req.body as { feeIds?: unknown })?.feeIds
        );
        const payableFees = fees.filter((fee) => fee.amount > 0);
        const totalAmount = payableFees.reduce((sum, fee) => sum + fee.amount, 0);

        if (!payableFees.length || totalAmount <= 0) {
            res.status(400).json({ error: 'Nu există nicio sumă de plată pentru acest jucător.' });
            return;
        }

        const stripe = getStripe();
        const returnUrl = getPaymentsReturnUrl(req);
        const label = payableFees.length === 1 ? payableFees[0].label : 'Plată sold';
        const feeIds = payableFees.map((fee) => fee.id);
        const payerUserId = String((req as AuthenticatedRequest).user?.id ?? '');
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
                    ...feeIdMetadata(feeIds),
                    label,
                    payerUserId: payerUserId,
                },
            },
            metadata: {
                source: 'player_payments',
                playerId: String(currentPlayer.data.id),
                ...feeIdMetadata(feeIds),
                label,
                // The player or a linked parent — shown as "Plătit de …".
                payerUserId: payerUserId,
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
        const customerId = await ensureStripeCustomer(await getPayer(req));
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
        const { sessionId } = req.body as { sessionId?: string };
        if (!sessionId) {
            res.status(400).json({ error: 'sessionId is required.' });
            return;
        }

        const stripe = getStripe();
        const session = await stripe.checkout.sessions.retrieve(sessionId);
        // The account that opened the checkout may confirm it. Matching only
        // the currently selected child made a parent who switched children
        // during checkout get a 403 for a payment that had gone through.
        const callerId = Number((req as AuthenticatedRequest).user?.id);
        const payerId = Number(session.metadata?.payerUserId);
        const openedByCaller = Number.isInteger(callerId) && callerId > 0 && payerId === callerId;
        if (!openedByCaller) {
            const currentPlayer = await getCurrentPlayer(req);
            if (Number(session.metadata?.playerId) !== currentPlayer.data.id) {
                res.status(403).json({ error: 'Această plată nu aparține contului tău.' });
                return;
            }
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
            paymentMethods: await listPayerPaymentMethods(await getPayer(req)),
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
            billingStartMonth: data.billingStartMonth ?? null,
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
        const updates: Record<string, unknown> = {};

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

        const { billingStartMonth } = req.body as { billingStartMonth?: unknown };
        if (billingStartMonth !== undefined) {
            if (billingStartMonth === null || billingStartMonth === '') {
                updates.billingStartMonth = null;
            } else if (!isValidBillingMonth(billingStartMonth)) {
                res.status(400).json({ error: 'Luna de început trebuie să fie de forma AAAA-LL.' });
                return;
            } else {
                const now = new Date();
                if (String(billingStartMonth) > monthKey(now.getFullYear(), now.getMonth() + 1)) {
                    res.status(400).json({ error: 'Luna de început nu poate fi în viitor.' });
                    return;
                }
                updates.billingStartMonth = String(billingStartMonth);
            }
        }

        if (clubId === null) {
            // A superadmin without a club: there is no club whose fees to change.
            res.status(400).json({ error: 'Alege clubul ale cărui taxe le modifici.' });
            return;
        }

        const pgUpdates: Partial<typeof pgFinancialSettings.$inferInsert> = {
            ...(updates.monthlyPlayerFee !== undefined ? { monthlyPlayerFee: Number(updates.monthlyPlayerFee) } : {}),
            ...(updates.trainingLevy !== undefined ? { trainingLevy: Number(updates.trainingLevy) } : {}),
            ...(updates.facilityFee !== undefined ? { facilityFee: Number(updates.facilityFee) } : {}),
            ...(updates.autoAdjust !== undefined ? { autoAdjust: Number(updates.autoAdjust) } : {}),
            ...(updates.paymentDueDay !== undefined ? { paymentDueDay: Number(updates.paymentDueDay) } : {}),
            ...(updates.billingStartMonth !== undefined ? { billingStartMonth: updates.billingStartMonth as string | null } : {}),
            updatedAt: new Date().toISOString(),
        };
        // The club's row, found by its club_id (and created on first use).
        const existing = await getClubFeeSettings(clubId);
        const [data] = await db.update(pgFinancialSettings).set(pgUpdates).where(eq(pgFinancialSettings.id, existing.id)).returning();
        res.json({
            ...data,
            monthlyPlayerFee: normalizeMoneyValue(data.monthlyPlayerFee) ?? 0,
            trainingLevy: normalizeMoneyValue(data.trainingLevy) ?? 0,
            facilityFee: normalizeMoneyValue(data.facilityFee) ?? 0,
            autoAdjust: Number(data.autoAdjust ?? 1) ? 1 : 0,
            paymentDueDay: resolveDueDay(data.paymentDueDay),
            billingStartMonth: data.billingStartMonth ?? null,
            updatedAt: toIso(data.updatedAt as any) ?? new Date().toISOString(),
        });
        await recordFinanceAudit({
            action: 'finance.settings.update',
            entityType: 'financial_settings',
            entityId: existing.id,
            clubId,
            metadata: { store: 'postgres', changes: settingsAuditChanges(existing, updates) },
            ...financeAuditActor(req),
        });
    } catch (error) {
        console.error('[PATCH /api/finance/settings]', error);
        res.status(500).json({ error: 'Failed to update settings' });
    }
});

export default router;
