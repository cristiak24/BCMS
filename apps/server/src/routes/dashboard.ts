import { Router, type Request } from 'express';
import { firestore, toDate } from '../lib/firebaseAdmin';
import { db } from '../db';
import {
    attendance as pgAttendance,
    financialDocuments as pgFinancialDocuments,
    playerPayments as pgPlayerPayments,
    players as pgPlayers,
    playersToTeams as pgPlayersToTeams,
    teams as pgTeams,
    users as pgUsers,
} from '../db/schema';
import { eq, inArray } from 'drizzle-orm';
import { getRequestUser } from '../lib/requestContext';
import { normalizeRole } from '../lib/requestAuth';

const router = Router();

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
            date?: FirebaseFirestore.Timestamp | Date | string | null;
        });

        const firestoreDocumentIncome = financialDocs
            .filter((doc) => normalizeStatus(doc.status) === 'processed')
            .reduce((sum, doc) => sum + Number(doc.amount ?? 0), 0);

        const firestoreMonthlyDocumentIncome = financialDocs
            .filter((doc) => normalizeStatus(doc.status) === 'processed')
            .filter((doc) => {
                const date = toDate(doc.date);
                return date ? date >= startOfMonth && date <= endOfMonth : false;
            })
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

        const postgresDocumentIncome = pgFinancialDocs
            .filter((doc) => normalizeStatus(doc.status) === 'processed')
            .reduce((sum, doc) => sum + amountOf(doc.amount), 0);
        const postgresMonthlyDocumentIncome = pgFinancialDocs
            .filter((doc) => normalizeStatus(doc.status) === 'processed')
            .filter((doc) => {
                const date = toDate(doc.date);
                return date ? date >= startOfMonth && date <= endOfMonth : false;
            })
            .reduce((sum, doc) => sum + amountOf(doc.amount), 0);
        const postgresPaymentIncome = pgPaymentRows
            .filter((payment) => isPaidStatus(payment.status))
            .reduce((sum, payment) => sum + amountOf(payment.amount), 0);
        const postgresMonthlyPaymentIncome = pgPaymentRows
            .filter((payment) => isPaidStatus(payment.status))
            .filter((payment) => {
                const date = toDate(payment.date ?? payment.createdAt);
                return date ? date >= startOfMonth && date <= endOfMonth : false;
            })
            .reduce((sum, payment) => sum + amountOf(payment.amount), 0);

        const totalIncome = postgresDocumentIncome + postgresPaymentIncome + firestoreDocumentIncome + firestorePaymentIncome;
        const monthlyIncome = postgresMonthlyDocumentIncome + postgresMonthlyPaymentIncome + firestoreMonthlyDocumentIncome + firestoreMonthlyPaymentIncome;

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

        const todayTs = new Date();
        const in30Days = new Date();
        in30Days.setDate(todayTs.getDate() + 30);

        const expiredVisasItems = playerDocs
            .map((docSnap) => docSnap.data() as {
                id: number;
                firstName?: string | null;
                lastName?: string | null;
                medicalCheckExpiry?: FirebaseFirestore.Timestamp | Date | string | null;
            })
            .filter((player) => {
                const expiry = toDate(player.medicalCheckExpiry);
                return expiry ? expiry.getTime() <= todayTs.getTime() : false;
            });

        const expiringItems = playerDocs
            .map((docSnap) => docSnap.data() as {
                id: number;
                firstName?: string | null;
                lastName?: string | null;
                medicalCheckExpiry?: FirebaseFirestore.Timestamp | Date | string | null;
            })
            .filter((player) => {
                const expiry = toDate(player.medicalCheckExpiry);
                return expiry ? expiry >= todayTs && expiry <= in30Days : false;
            })
            .map((player) => {
                const expiry = toDate(player.medicalCheckExpiry);
                const daysLeft = expiry ? Math.ceil((expiry.getTime() - todayTs.getTime()) / 86400000) : null;
                return {
                    type: 'VIZĂ MEDICALĂ' as const,
                    name: `${player.firstName ?? ''} ${player.lastName ?? ''}`.trim(),
                    daysLeft,
                    expiryDate: expiry ? expiry.toLocaleDateString('ro-RO') : '',
                    urgent: daysLeft !== null && daysLeft <= 7,
                };
            });

        res.json({
            activePlayerCount,
            teamCount,
            totalIncome,
            monthlyIncome,
            pendingPaymentsCount,
            attendanceRate,
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
