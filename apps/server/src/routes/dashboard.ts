import { Router, type Request } from 'express';
import { firestore, toDate } from '../lib/firebaseAdmin';
import { db } from '../db';
import {
    attendance as pgAttendance,
    financialDocuments as pgFinancialDocuments,
    financialSettings as pgFinancialSettings,
    playerPayments as pgPlayerPayments,
    players as pgPlayers,
    playersToTeams as pgPlayersToTeams,
    teams as pgTeams,
    users as pgUsers,
} from '../db/schema';
import { eq, inArray } from 'drizzle-orm';
import { getRequestUser } from '../lib/requestContext';
import { normalizeRole } from '../lib/requestAuth';
import { authenticate, requireRoles } from '../middleware/auth';

const router = Router();

router.use(authenticate, requireRoles(['admin', 'coach', 'accountant']));

function normalizeStatus(status?: string | null) {
    return String(status ?? '').trim().toLowerCase();
}

function isPaidStatus(status?: string | null) {
    const normalized = normalizeStatus(status);
    return normalized === 'paid' || normalized === 'processed' || normalized === 'succeeded' || normalized === 'success';
}

function isPresentStatus(status?: string | null) {
    const normalized = normalizeStatus(status);
    return normalized === 'present' || normalized === 'late' || normalized === 'medical' || normalized === 'excused';
}

function isExpenseType(type?: string | null) {
    return normalizeStatus(type) === 'expense';
}

function amountOf(value: unknown) {
    const amount = Number(value ?? 0);
    return Number.isFinite(amount) ? amount : 0;
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

async function getFirestoreDocs(collectionName: string) {
    if (!canUseFirestoreDocuments()) {
        return [];
    }

    try {
        const snap = await firestore.collection(collectionName).get();
        return snap.docs;
    } catch (error) {
        console.error(`[dashboard/summary] Firestore ${collectionName} fallback:`, error);
        return [];
    }
}

async function getDashboardFinancialSettings(clubId: number | null) {
    if (canUseFirestoreDocuments()) {
        try {
            const docId = clubId != null ? `club:${clubId}` : '1';
            const snap = await firestore.collection('financialSettings').doc(docId).get();
            if (snap.exists) {
                return snap.data() as { monthlyPlayerFee?: number; trainingLevy?: number; facilityFee?: number };
            }
        } catch (error) {
            console.error('[dashboard/summary] financialSettings fallback:', error);
        }
    }

    const rows = await db.select().from(pgFinancialSettings).where(eq(pgFinancialSettings.id, 1)).limit(1);
    return rows[0] ?? null;
}

async function resolveDashboardScope(req: Request) {
    const user = await getRequestUser(req);
    const role = normalizeRole(user?.role);

    if (!user || role === 'superadmin' || user.clubId == null) {
        return { clubId: null as number | null, teamIds: null as number[] | null };
    }

    const clubId = Number(user.clubId);
    const teamRows = await db.select({ id: pgTeams.id }).from(pgTeams).where(eq(pgTeams.clubId, clubId));

    return {
        clubId,
        teamIds: teamRows.map((team) => team.id),
    };
}

async function getScopedPostgresPlayers(clubId: number | null, teamIds: number[] | null) {
    if (clubId == null) {
        return db.select().from(pgPlayers);
    }

    const playersById = new Map<number, typeof pgPlayers.$inferSelect>();

    if (teamIds?.length) {
        const directPlayers = await db.select().from(pgPlayers).where(inArray(pgPlayers.teamId, teamIds));
        const relationRows = await db
            .select({ player: pgPlayers })
            .from(pgPlayersToTeams)
            .innerJoin(pgPlayers, eq(pgPlayersToTeams.playerId, pgPlayers.id))
            .where(inArray(pgPlayersToTeams.teamId, teamIds));

        directPlayers.forEach((player) => playersById.set(player.id, player));
        relationRows.forEach((row) => playersById.set(row.player.id, row.player));
    }

    const clubUserRows = await db.select({ email: pgUsers.email }).from(pgUsers).where(eq(pgUsers.clubId, clubId));
    const clubUserEmails = clubUserRows.map((user) => user.email.trim().toLowerCase());
    if (clubUserEmails.length) {
        const userPlayers = await db.select().from(pgPlayers).where(inArray(pgPlayers.email, clubUserEmails));
        userPlayers.forEach((player) => playersById.set(player.id, player));
    }

    return Array.from(playersById.values());
}

router.get('/summary', async (req, res) => {
    try {
        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
        const startOfPrevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const endOfPrevMonth = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);
        const scope = await resolveDashboardScope(req);
        const scopedPlayers = await getScopedPostgresPlayers(scope.clubId, scope.teamIds);
        const scopedPlayerIds = scopedPlayers.map((player) => player.id);

        const [playerDocs, teamDocs, financialDocDocs, paymentDocs, attendanceDocs] = await Promise.all([
            getFirestoreDocs('players'),
            getFirestoreDocs('teams'),
            getFirestoreDocs('financialDocuments'),
            getFirestoreDocs('playerPayments'),
            getFirestoreDocs('attendance'),
        ]);

        const pgFinancialDocs = await db.select().from(pgFinancialDocuments);
        const pgPaymentRows = scopedPlayerIds.length
            ? await db.select().from(pgPlayerPayments).where(inArray(pgPlayerPayments.playerId, scopedPlayerIds))
            : [];
        const pgAttendanceRows = scopedPlayerIds.length
            ? await db.select().from(pgAttendance).where(inArray(pgAttendance.playerId, scopedPlayerIds))
            : [];

        const postgresActivePlayerCount = scopedPlayers.filter((player) => normalizeStatus(player.status ?? 'active') === 'active').length;
        const firestoreActivePlayerCount = playerDocs.filter((docSnap) => normalizeStatus((docSnap.data() as { status?: string }).status ?? 'active') === 'active').length;
        const activePlayerCount = scopedPlayers.length > 0 ? postgresActivePlayerCount : firestoreActivePlayerCount;
        const teamCount = scope.teamIds?.length ?? teamDocs.length;

        const financialDocs = financialDocDocs.map((docSnap) => docSnap.data() as {
            amount?: number;
            status?: string;
            type?: string;
            date?: FirebaseFirestore.Timestamp | Date | string | null;
        });

        const processedFirestoreDocs = financialDocs.filter((doc) => normalizeStatus(doc.status) === 'processed');
        const firestoreIncomeDocs = processedFirestoreDocs.filter((doc) => !isExpenseType(doc.type));
        const firestoreExpenseDocs = processedFirestoreDocs.filter((doc) => isExpenseType(doc.type));

        const firestoreDocumentIncome = firestoreIncomeDocs.reduce((sum, doc) => sum + Number(doc.amount ?? 0), 0);
        const firestoreDocumentExpense = firestoreExpenseDocs.reduce((sum, doc) => sum + Number(doc.amount ?? 0), 0);

        const inRange = (date: Date | null, start: Date, end: Date) => (date ? date >= start && date <= end : false);

        const firestoreMonthlyDocumentIncome = firestoreIncomeDocs
            .filter((doc) => inRange(toDate(doc.date), startOfMonth, endOfMonth))
            .reduce((sum, doc) => sum + Number(doc.amount ?? 0), 0);
        const firestoreMonthlyDocumentExpense = firestoreExpenseDocs
            .filter((doc) => inRange(toDate(doc.date), startOfMonth, endOfMonth))
            .reduce((sum, doc) => sum + Number(doc.amount ?? 0), 0);
        const firestorePrevMonthDocumentIncome = firestoreIncomeDocs
            .filter((doc) => inRange(toDate(doc.date), startOfPrevMonth, endOfPrevMonth))
            .reduce((sum, doc) => sum + Number(doc.amount ?? 0), 0);
        const firestorePrevMonthDocumentExpense = firestoreExpenseDocs
            .filter((doc) => inRange(toDate(doc.date), startOfPrevMonth, endOfPrevMonth))
            .reduce((sum, doc) => sum + Number(doc.amount ?? 0), 0);

        const firestorePaidPayments = paymentDocs
            .map((docSnap) => docSnap.data() as {
                amount?: number | string | null;
                status?: string | null;
                date?: FirebaseFirestore.Timestamp | Date | string | null;
                createdAt?: FirebaseFirestore.Timestamp | Date | string | null;
                playerId?: number | string | null;
            })
            .filter((payment) => isPaidStatus(payment.status));
        const firestorePaymentIncome = firestorePaidPayments.reduce((sum, payment) => sum + amountOf(payment.amount), 0);
        const firestoreMonthlyPaymentIncome = firestorePaidPayments
            .filter((payment) => {
                const date = toDate(payment.date ?? payment.createdAt);
                return date ? date >= startOfMonth && date <= endOfMonth : false;
            })
            .reduce((sum, payment) => sum + amountOf(payment.amount), 0);

        const processedPgDocs = pgFinancialDocs.filter((doc) => normalizeStatus(doc.status) === 'processed');
        const pgIncomeDocs = processedPgDocs.filter((doc) => !isExpenseType(doc.type));
        const pgExpenseDocs = processedPgDocs.filter((doc) => isExpenseType(doc.type));

        const postgresDocumentIncome = pgIncomeDocs.reduce((sum, doc) => sum + amountOf(doc.amount), 0);
        const postgresDocumentExpense = pgExpenseDocs.reduce((sum, doc) => sum + amountOf(doc.amount), 0);
        const postgresMonthlyDocumentIncome = pgIncomeDocs
            .filter((doc) => inRange(toDate(doc.date), startOfMonth, endOfMonth))
            .reduce((sum, doc) => sum + amountOf(doc.amount), 0);
        const postgresMonthlyDocumentExpense = pgExpenseDocs
            .filter((doc) => inRange(toDate(doc.date), startOfMonth, endOfMonth))
            .reduce((sum, doc) => sum + amountOf(doc.amount), 0);
        const postgresPrevMonthDocumentIncome = pgIncomeDocs
            .filter((doc) => inRange(toDate(doc.date), startOfPrevMonth, endOfPrevMonth))
            .reduce((sum, doc) => sum + amountOf(doc.amount), 0);
        const postgresPrevMonthDocumentExpense = pgExpenseDocs
            .filter((doc) => inRange(toDate(doc.date), startOfPrevMonth, endOfPrevMonth))
            .reduce((sum, doc) => sum + amountOf(doc.amount), 0);

        const paidPgPayments = pgPaymentRows.filter((payment) => isPaidStatus(payment.status));
        const postgresPaymentIncome = paidPgPayments.reduce((sum, payment) => sum + amountOf(payment.amount), 0);
        const postgresMonthlyPaymentIncome = paidPgPayments
            .filter((payment) => inRange(toDate(payment.date ?? payment.createdAt), startOfMonth, endOfMonth))
            .reduce((sum, payment) => sum + amountOf(payment.amount), 0);
        const postgresPrevMonthPaymentIncome = paidPgPayments
            .filter((payment) => inRange(toDate(payment.date ?? payment.createdAt), startOfPrevMonth, endOfPrevMonth))
            .reduce((sum, payment) => sum + amountOf(payment.amount), 0);

        const firestorePrevMonthPaymentIncome = firestorePaidPayments
            .filter((payment) => inRange(toDate(payment.date ?? payment.createdAt), startOfPrevMonth, endOfPrevMonth))
            .reduce((sum, payment) => sum + amountOf(payment.amount), 0);

        const totalIncome = postgresDocumentIncome + postgresPaymentIncome + firestoreDocumentIncome + firestorePaymentIncome;
        const totalExpense = postgresDocumentExpense + firestoreDocumentExpense;
        const profit = totalIncome - totalExpense;

        const monthlyIncome = postgresMonthlyDocumentIncome + postgresMonthlyPaymentIncome + firestoreMonthlyDocumentIncome + firestoreMonthlyPaymentIncome;
        const monthlyExpense = postgresMonthlyDocumentExpense + firestoreMonthlyDocumentExpense;
        const monthlyProfit = monthlyIncome - monthlyExpense;

        const previousMonthIncome = postgresPrevMonthDocumentIncome + postgresPrevMonthPaymentIncome + firestorePrevMonthDocumentIncome + firestorePrevMonthPaymentIncome;
        const incomeChangePercent = previousMonthIncome > 0
            ? Math.round(((monthlyIncome - previousMonthIncome) / previousMonthIncome) * 100)
            : null;

        const previousMonthExpense = postgresPrevMonthDocumentExpense + firestorePrevMonthDocumentExpense;
        const previousMonthProfit = previousMonthIncome - previousMonthExpense;
        const profitChangePercent = previousMonthProfit !== 0
            ? Math.round(((monthlyProfit - previousMonthProfit) / Math.abs(previousMonthProfit)) * 100)
            : null;

        const pendingPaymentsCount = paymentDocs.filter((docSnap) => normalizeStatus((docSnap.data() as { status?: string }).status ?? 'pending') === 'pending').length
            + pgPaymentRows.filter((row) => normalizeStatus(row.status ?? 'pending') === 'pending').length;

        const attendanceRows = attendanceDocs.map((docSnap) => docSnap.data() as {
            status: string;
            date?: FirebaseFirestore.Timestamp | Date | string | null;
        });

        const firestorePresentCount = attendanceRows.filter((row) => {
            const date = toDate(row.date);
            return isPresentStatus(row.status) && date ? date >= startOfMonth && date <= endOfMonth : false;
        }).length;

        const firestoreAttendanceRecords = attendanceRows.filter((row) => {
            const date = toDate(row.date);
            return date ? date >= startOfMonth && date <= endOfMonth : false;
        });
        const postgresMonthlyAttendanceRows = pgAttendanceRows.filter((row) => {
            const date = toDate(row.date);
            return date ? date >= startOfMonth && date <= endOfMonth : false;
        });

        const presentCount = firestorePresentCount + postgresMonthlyAttendanceRows.filter((row) => isPresentStatus(row.status)).length;
        const totalAttendanceRecords = firestoreAttendanceRecords.length + postgresMonthlyAttendanceRows.length;

        const attendanceRate = totalAttendanceRecords > 0
            ? Math.round((presentCount / totalAttendanceRecords) * 100)
            : null;

        const prevMonthFirestoreAttendanceRows = attendanceRows.filter((row) => inRange(toDate(row.date), startOfPrevMonth, endOfPrevMonth));
        const prevMonthPgAttendanceRows = pgAttendanceRows.filter((row) => inRange(toDate(row.date), startOfPrevMonth, endOfPrevMonth));
        const previousPresentCount = prevMonthFirestoreAttendanceRows.filter((row) => isPresentStatus(row.status)).length
            + prevMonthPgAttendanceRows.filter((row) => isPresentStatus(row.status)).length;
        const previousTotalAttendanceRecords = prevMonthFirestoreAttendanceRows.length + prevMonthPgAttendanceRows.length;
        const previousAttendanceRate = previousTotalAttendanceRecords > 0
            ? Math.round((previousPresentCount / previousTotalAttendanceRecords) * 100)
            : null;
        const attendanceChangePoints = attendanceRate != null && previousAttendanceRate != null
            ? attendanceRate - previousAttendanceRate
            : null;

        const firestorePlayerCreatedAt = playerDocs.map((docSnap) => docSnap.data() as {
            createdAt?: FirebaseFirestore.Timestamp | Date | string | null;
        });
        const newPlayersThisMonth = scopedPlayers.length > 0
            ? scopedPlayers.filter((player) => inRange(toDate(player.createdAt), startOfMonth, endOfMonth)).length
            : firestorePlayerCreatedAt.filter((player) => inRange(toDate(player.createdAt), startOfMonth, endOfMonth)).length;
        const newPlayersLastMonth = scopedPlayers.length > 0
            ? scopedPlayers.filter((player) => inRange(toDate(player.createdAt), startOfPrevMonth, endOfPrevMonth)).length
            : firestorePlayerCreatedAt.filter((player) => inRange(toDate(player.createdAt), startOfPrevMonth, endOfPrevMonth)).length;
        const playerCountChange = newPlayersThisMonth - newPlayersLastMonth;

        const todayTs = new Date();
        const in30Days = new Date();
        in30Days.setDate(todayTs.getDate() + 30);

        type MedicalCheckCandidate = {
            firstName?: string | null;
            lastName?: string | null;
            medicalCheckExpiry?: FirebaseFirestore.Timestamp | Date | string | null;
        };

        const medicalCheckCandidates: MedicalCheckCandidate[] = scopedPlayers.length > 0
            ? scopedPlayers
            : playerDocs.map((docSnap) => docSnap.data() as MedicalCheckCandidate);

        const expiredVisasItems = medicalCheckCandidates
            .filter((player) => {
                const expiry = toDate(player.medicalCheckExpiry);
                return expiry ? expiry.getTime() <= todayTs.getTime() : false;
            });

        const expiringItems: Array<{
            type: string;
            name: string;
            daysLeft: number | null;
            expiryDate: string;
            urgent: boolean;
        }> = medicalCheckCandidates
            .filter((player) => {
                const expiry = toDate(player.medicalCheckExpiry);
                return expiry ? expiry >= todayTs && expiry <= in30Days : false;
            })
            .map((player) => {
                const expiry = toDate(player.medicalCheckExpiry);
                const daysLeft = expiry ? Math.ceil((expiry.getTime() - todayTs.getTime()) / 86400000) : null;
                return {
                    type: 'VIZĂ MEDICALĂ',
                    name: `${player.firstName ?? ''} ${player.lastName ?? ''}`.trim(),
                    daysLeft,
                    expiryDate: expiry ? expiry.toLocaleDateString('ro-RO') : '',
                    urgent: daysLeft !== null && daysLeft <= 7,
                };
            });

        const financialSettings = await getDashboardFinancialSettings(scope.clubId);
        const hasRecurringFees = financialSettings != null && (
            Number(financialSettings.monthlyPlayerFee ?? 0) > 0 ||
            Number(financialSettings.trainingLevy ?? 0) > 0 ||
            Number(financialSettings.facilityFee ?? 0) > 0
        );

        if (hasRecurringFees && pendingPaymentsCount > 0) {
            const feeDueDate = new Date(now.getFullYear(), now.getMonth(), 28);
            const daysLeft = Math.ceil((feeDueDate.getTime() - todayTs.getTime()) / 86400000);
            if (daysLeft <= 14) {
                expiringItems.push({
                    type: 'COTIZAȚIE LUNARĂ',
                    name: `${pendingPaymentsCount} ${pendingPaymentsCount === 1 ? 'plată restantă' : 'plăți restante'}`,
                    daysLeft: daysLeft >= 0 ? daysLeft : null,
                    expiryDate: feeDueDate.toLocaleDateString('ro-RO'),
                    urgent: daysLeft <= 7,
                });
            }
        }

        expiringItems.sort((a, b) => (a.daysLeft ?? -Infinity) - (b.daysLeft ?? -Infinity));

        res.json({
            activePlayerCount,
            playerCountChange,
            teamCount,
            totalIncome,
            monthlyIncome,
            totalExpense,
            monthlyExpense,
            profit,
            monthlyProfit,
            previousMonthIncome,
            incomeChangePercent,
            profitChangePercent,
            pendingPaymentsCount,
            attendanceRate,
            previousAttendanceRate,
            attendanceChangePoints,
            presentCount,
            totalAttendanceRecords,
            expiredVisasCount: expiredVisasItems.length,
            expiringItems,
        });
    } catch (e) {
        console.error('[dashboard/summary] error:', e);
        res.status(500).json({ error: 'Failed to fetch dashboard summary' });
    }
});

export default router;
