import { Router } from 'express';
import { firestore, toDate } from '../lib/firebaseAdmin';

const router = Router();

router.get('/summary', async (_req, res) => {
    try {
        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

        const playersSnap = await firestore.collection('players').get();
        const teamsSnap = await firestore.collection('teams').get();
        const financialDocsSnap = await firestore.collection('financialDocuments').get();
        const paymentsSnap = await firestore.collection('playerPayments').get();
        const attendanceSnap = await firestore.collection('attendance').get();

        const activePlayerCount = playersSnap.docs.filter((docSnap) => ((docSnap.data() as { status?: string }).status ?? 'active') === 'active').length;
        const teamCount = teamsSnap.size;

        const financialDocs = financialDocsSnap.docs.map((docSnap) => docSnap.data() as {
            amount?: number;
            status?: string;
            date?: FirebaseFirestore.Timestamp | Date | string | null;
        });

        const totalIncome = financialDocs
            .filter((doc) => doc.status === 'processed')
            .reduce((sum, doc) => sum + Number(doc.amount ?? 0), 0);

        const monthlyIncome = financialDocs
            .filter((doc) => doc.status === 'processed')
            .filter((doc) => {
                const date = toDate(doc.date);
                return date ? date >= startOfMonth && date <= endOfMonth : false;
            })
            .reduce((sum, doc) => sum + Number(doc.amount ?? 0), 0);

        const pendingPaymentsCount = paymentsSnap.docs.filter((docSnap) => ((docSnap.data() as { status?: string }).status ?? 'pending') === 'pending').length;

        const attendanceRows = attendanceSnap.docs.map((docSnap) => docSnap.data() as {
            status: string;
            date?: FirebaseFirestore.Timestamp | Date | string | null;
        });

        const presentCount = attendanceRows.filter((row) => {
            const date = toDate(row.date);
            return (row.status === 'present') && date ? date >= startOfMonth && date <= endOfMonth : false;
        }).length;

        const totalAttendanceRecords = attendanceRows.filter((row) => {
            const date = toDate(row.date);
            return date ? date >= startOfMonth && date <= endOfMonth : false;
        }).length;

        const attendanceRate = totalAttendanceRecords > 0
            ? Math.round((presentCount / totalAttendanceRecords) * 100)
            : null;

        const todayTs = new Date();
        const in30Days = new Date();
        in30Days.setDate(todayTs.getDate() + 30);

        const expiredVisasItems = playersSnap.docs
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

        const expiringItems = playersSnap.docs
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
