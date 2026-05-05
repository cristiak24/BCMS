import { Router, type Request, type Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import Stripe from 'stripe';
import { admin, firestore, nextNumericId, toDate, toIso } from '../lib/firebaseAdmin';
import { requireRequestUser } from '../lib/requestContext';
import { normalizeRole } from '../lib/requestAuth';
import { db } from '../db';
import {
    events as pgEvents,
    financialSettings as pgFinancialSettings,
    playerPayments as pgPlayerPayments,
    players as pgPlayers,
    playersToTeams as pgPlayersToTeams,
    teams as pgTeams,
    users as pgUsers,
} from '../db/schema';
import { eq, inArray, sql } from 'drizzle-orm';

const router = Router();
const DEFAULT_STRIPE_PUBLISHABLE_KEY = 'pk_test_51TP7NnCFpLYWSHx5i7EAuPRWUXgoP0lxHFIqDIGvyQOpNIbu4VOg2IMg7H8LW5HgTslJVudDxe3xnGXgRIubcVbA00swDdrRS0';
const DEFAULT_PAYMENT_CURRENCY = (process.env.STRIPE_CURRENCY || 'ron').trim().toLowerCase();
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
    updatedAt?: FirebaseFirestore.Timestamp | Date | string | null;
};

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
        if (!isFirestoreNotFound(error)) {
            throw error;
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

async function getPlayerClubId(player: PlayerDoc) {
    const directClubId = Number(player.clubId);
    if (Number.isFinite(directClubId) && directClubId > 0) {
        return directClubId;
    }

    const teamIds = await getPlayerTeamIds(player);
    for (const teamId of teamIds) {
        try {
            const teamSnap = await firestore.collection('teams').where('id', '==', teamId).limit(1).get();
            const teamDoc = teamSnap.docs[0];
            const clubId = Number((teamDoc?.data() as { clubId?: number } | undefined)?.clubId);
            if (Number.isFinite(clubId) && clubId > 0) {
                return clubId;
            }
        } catch (error) {
            if (!isFirestoreNotFound(error)) {
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

async function seedSettingsData(clubId?: number | null): Promise<FinancialSettingsDoc> {
    let legacy: FinancialSettingsDoc | null = null;
    if (canUseFirestoreDocuments()) {
        try {
            const legacySnap = await firestore.collection('financialSettings').doc('1').get();
            legacy = legacySnap.exists ? legacySnap.data() as FinancialSettingsDoc : null;
        } catch (error) {
            if (!isFirestoreNotFound(error)) {
                console.error('[finance/settings] Legacy Firestore settings fallback:', error);
            }
        }
    }

    if (!legacy) {
        const rows = await db
            .select()
            .from(pgFinancialSettings)
            .where(eq(pgFinancialSettings.id, 1))
            .limit(1);
        const existing = rows[0];
        if (existing) {
            legacy = {
                id: existing.id,
                monthlyPlayerFee: existing.monthlyPlayerFee,
                trainingLevy: existing.trainingLevy,
                facilityFee: existing.facilityFee,
                autoAdjust: existing.autoAdjust,
                updatedAt: existing.updatedAt,
            };
        }
    }

    return {
        id: clubId ?? 1,
        clubId: clubId ?? null,
        monthlyPlayerFee: normalizeMoneyValue(legacy?.monthlyPlayerFee) ?? 0,
        trainingLevy: normalizeMoneyValue(legacy?.trainingLevy) ?? 0,
        facilityFee: normalizeMoneyValue(legacy?.facilityFee) ?? 0,
        autoAdjust: Number(legacy?.autoAdjust ?? 1) ? 1 : 0,
        updatedAt: new Date(),
    };
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

    await ref.set(await seedSettingsData(clubId));
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

    const rows = await db
        .select()
        .from(pgFinancialSettings)
        .where(eq(pgFinancialSettings.id, 1))
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
            updatedAt: existing.updatedAt,
        };
    }

    const inserted = await db
        .insert(pgFinancialSettings)
        .values({
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

    try {
        const membershipsSnap = await firestore.collection('playersToTeams').where('playerId', '==', player.id).get();
        membershipsSnap.docs.forEach((docSnap) => {
            const teamId = Number((docSnap.data() as { teamId?: number }).teamId);
            if (Number.isFinite(teamId)) {
                ids.add(teamId);
            }
        });
    } catch (error) {
        if (!isFirestoreNotFound(error)) {
            throw error;
        }

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
    }

    return ids;
}

async function getPlayerPaymentRows(playerId: number) {
    try {
        const snap = await firestore.collection('playerPayments').where('playerId', '==', playerId).get();
        return snap.docs.map((docSnap) => ({
            ref: docSnap.ref,
            data: docSnap.data() as PlayerPaymentDoc,
        }));
    } catch (error) {
        if (!isFirestoreNotFound(error)) {
            throw error;
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
    try {
        const snap = await firestore.collection('players').where('id', '==', playerId).limit(1).get();
        const doc = snap.docs[0];
        if (doc) {
            return doc.data() as PlayerDoc;
        }
    } catch (error) {
        if (!isFirestoreNotFound(error)) {
            throw error;
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
    let eventRows: EventFeeDoc[];
    try {
        const eventsSnap = await firestore.collection('events').get();
        eventRows = eventsSnap.docs.map((docSnap) => docSnap.data() as EventFeeDoc);
    } catch (error) {
        if (!isFirestoreNotFound(error)) {
            throw error;
        }

        eventRows = await db
            .select()
            .from(pgEvents)
            .where(inArray(pgEvents.teamId, Array.from(teamIds))) as EventFeeDoc[];
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
                dueDate: new Date(currentYear, currentMonth - 1, 28).toISOString(),
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

async function buildAdminRecentPayments(clubId: number | null, limit = 12): Promise<AdminRecentPayment[]> {
    const teamRows = clubId == null
        ? await db.select({ id: pgTeams.id, name: pgTeams.name }).from(pgTeams)
        : await db.select({ id: pgTeams.id, name: pgTeams.name }).from(pgTeams).where(eq(pgTeams.clubId, clubId));
    const teamNameById = new Map(teamRows.map((team) => [team.id, team.name]));
    const teamIds = teamRows.map((team) => team.id);

    const directPlayers = clubId == null
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
    const clubUserRows = clubId == null
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
        cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({ storage });

router.get('/documents', async (_req, res) => {
    try {
        const snap = await firestore.collection('financialDocuments').orderBy('date', 'desc').get();
        const docs = snap.docs.map((docSnap) => {
            const data = docSnap.data() as {
                id: number;
                type: string;
                amount: number;
                description: string;
                date?: FirebaseFirestore.Timestamp | Date | string | null;
                documentUrl?: string | null;
                status: 'pending' | 'processed' | 'rejected';
            };

            return {
                ...data,
                date: toIso(data.date) ?? new Date().toISOString(),
            };
        });
        res.json(docs);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to fetch documents' });
    }
});

router.patch('/documents/:id/status', async (req, res) => {
    const id = Number(req.params.id);
    const { status } = req.body as { status?: string };

    if (!status || !['pending', 'processed', 'rejected'].includes(status)) {
        res.status(400).json({ error: 'Invalid status' });
        return;
    }

    try {
        const snap = await firestore.collection('financialDocuments').where('id', '==', id).limit(1).get();
        const docSnap = snap.docs[0];
        if (!docSnap) {
            res.status(404).json({ error: 'Document not found' });
            return;
        }

        await docSnap.ref.set({ status }, { merge: true });
        const updated = await docSnap.ref.get();
        res.json({
            ...(updated.data() as Record<string, unknown>),
            date: toIso((updated.data() as { date?: unknown }).date) ?? null,
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to update document status' });
    }
});

router.post('/upload', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            res.status(400).json({ error: 'No file uploaded' });
            return;
        }

        const { type, amount, description } = req.body;
        const documentUrl = `/uploads/${req.file.filename}`;
        const id = await nextNumericId('financialDocuments');
        const record = {
            id,
            type: type || 'expense',
            amount: amount ? parseInt(amount, 10) : 0,
            description: description || 'New Document',
            documentUrl,
            status: 'pending',
            date: new Date(),
        };

        await firestore.collection('financialDocuments').doc(String(id)).set(record);

        res.json({
            ...record,
            date: new Date().toISOString(),
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

        res.json(await buildAdminRecentPayments(clubId, limit));
    } catch (error) {
        handleRouteError(res, error, '[GET /api/finance/admin/recent-payments]');
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

        const { monthlyPlayerFee, trainingLevy, facilityFee, autoAdjust } = req.body;
        const updates: Record<string, unknown> = {
            id: clubId ?? 1,
            clubId: clubId ?? null,
            updatedAt: new Date(),
        };

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
            await ref.set(updates, { merge: true });

            const snap = await ref.get();
            const data = snap.data() as FinancialSettingsDoc;
            res.json({
                ...data,
                monthlyPlayerFee: normalizeMoneyValue(data.monthlyPlayerFee) ?? 0,
                trainingLevy: normalizeMoneyValue(data.trainingLevy) ?? 0,
                facilityFee: normalizeMoneyValue(data.facilityFee) ?? 0,
                autoAdjust: Number(data.autoAdjust ?? 1) ? 1 : 0,
                updatedAt: toIso(data.updatedAt as any) ?? new Date().toISOString(),
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
            updatedAt: new Date().toISOString(),
        };
        const existingRows = await db.select().from(pgFinancialSettings).where(eq(pgFinancialSettings.id, 1)).limit(1);
        const data = existingRows[0]
            ? (await db.update(pgFinancialSettings).set(pgUpdates).where(eq(pgFinancialSettings.id, 1)).returning())[0]
            : (await db.insert(pgFinancialSettings).values({
                monthlyPlayerFee: Number(updates.monthlyPlayerFee ?? 0),
                trainingLevy: Number(updates.trainingLevy ?? 0),
                facilityFee: Number(updates.facilityFee ?? 0),
                autoAdjust: Number(updates.autoAdjust ?? 1),
                updatedAt: new Date().toISOString(),
            }).returning())[0];
        res.json({
            ...data,
            monthlyPlayerFee: normalizeMoneyValue(data.monthlyPlayerFee) ?? 0,
            trainingLevy: normalizeMoneyValue(data.trainingLevy) ?? 0,
            facilityFee: normalizeMoneyValue(data.facilityFee) ?? 0,
            autoAdjust: Number(data.autoAdjust ?? 1) ? 1 : 0,
            updatedAt: toIso(data.updatedAt as any) ?? new Date().toISOString(),
        });
    } catch (error) {
        console.error('[PATCH /api/finance/settings]', error);
        res.status(500).json({ error: 'Failed to update settings' });
    }
});

export default router;
