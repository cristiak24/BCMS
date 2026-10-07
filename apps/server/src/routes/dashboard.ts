import { Router, type Request } from 'express';
import { toDate } from '../lib/dateUtils';
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
import { and, eq, gte, inArray } from 'drizzle-orm';
import { getRequestUser } from '../lib/requestContext';
import { resolveDashboardClubScope, type DashboardClubScope } from '../lib/dashboardScope';
import { clubBalances } from '../services/clubFinance';
import { authenticate, requireRoles } from '../middleware/auth';
import { isPaidStatus } from '../lib/paymentLedger';
import { isAttendedStatus, isCountedStatus } from '../lib/attendanceRate';

const router = Router();

// Club income, expenses and profit: admins and the accountant only. Coaches
// used to be let in too, and nothing on their screens reads this summary.
router.use(authenticate, requireRoles(['admin', 'accountant']));

function normalizeStatus(status?: string | null) {
    return String(status ?? '').trim().toLowerCase();
}


// Shared definition (lib/attendanceRate.ts): late = attended; medical and
// excused are left out of the rate.
const isPresentStatus = isAttendedStatus;

// Finanțe uploads both kinds from its "Cheltuieli și facturi" card: a supplier
// invoice is money going out, like an expense. Counting it as income (anything
// not literally "expense" used to be) inflated profit by the invoice amount.
const EXPENSE_TYPES = new Set(['expense', 'invoice', 'cheltuiala', 'cheltuială', 'factura', 'factură']);

function isExpenseType(type?: string | null) {
    return EXPENSE_TYPES.has(normalizeStatus(type));
}

function amountOf(value: unknown) {
    const amount = Number(value ?? 0);
    return Number.isFinite(amount) ? amount : 0;
}

async function resolveDashboardScope(req: Request) {
    const clubScope = resolveDashboardClubScope(await getRequestUser(req));

    if (clubScope.kind === 'all') {
        return { clubScope, clubId: null as number | null, teamIds: null as number[] | null };
    }

    if (clubScope.kind === 'none') {
        return { clubScope, clubId: null as number | null, teamIds: [] as number[] };
    }

    const { clubId } = clubScope;
    const teamRows = await db.select({ id: pgTeams.id }).from(pgTeams).where(eq(pgTeams.clubId, clubId));

    return {
        clubScope,
        clubId,
        teamIds: teamRows.map((team) => team.id),
    };
}

async function getScopedPostgresPlayers(clubScope: DashboardClubScope, teamIds: number[] | null) {
    if (clubScope.kind === 'all') {
        return db.select().from(pgPlayers);
    }

    if (clubScope.kind === 'none') {
        return [] as Array<typeof pgPlayers.$inferSelect>;
    }

    const { clubId } = clubScope;

    const playersById = new Map<number, typeof pgPlayers.$inferSelect>();

    // Independent lookups: run them together instead of one round trip each.
    const [directPlayers, relationRows, clubUserRows] = await Promise.all([
        teamIds?.length ? db.select().from(pgPlayers).where(inArray(pgPlayers.teamId, teamIds)) : [],
        teamIds?.length
            ? db
                .select({ player: pgPlayers })
                .from(pgPlayersToTeams)
                .innerJoin(pgPlayers, eq(pgPlayersToTeams.playerId, pgPlayers.id))
                .where(inArray(pgPlayersToTeams.teamId, teamIds))
            : [],
        db.select({ email: pgUsers.email }).from(pgUsers).where(eq(pgUsers.clubId, clubId)),
    ]);

    directPlayers.forEach((player) => playersById.set(player.id, player));
    relationRows.forEach((row) => playersById.set(row.player.id, row.player));

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
        const scopedPlayers = await getScopedPostgresPlayers(scope.clubScope, scope.teamIds);
        const scopedPlayerIds = scopedPlayers.map((player) => player.id);

        // Only this month and last month of attendance are read below; the
        // SQL bound (a couple of days early, so timezone edges stay inside)
        // stops this from loading the club's whole attendance history.
        const attendanceSince = new Date(startOfPrevMonth.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString();
        const [pgFinancialDocs, pgPaymentRows, pgAttendanceRows] = await Promise.all([
            scope.clubScope.kind === 'all'
                ? db.select().from(pgFinancialDocuments)
                : scope.clubId != null
                    ? db.select().from(pgFinancialDocuments).where(eq(pgFinancialDocuments.clubId, scope.clubId))
                    : [],
            scopedPlayerIds.length
                ? db.select().from(pgPlayerPayments).where(inArray(pgPlayerPayments.playerId, scopedPlayerIds))
                : [],
            scopedPlayerIds.length
                ? db.select().from(pgAttendance).where(and(
                    inArray(pgAttendance.playerId, scopedPlayerIds),
                    gte(pgAttendance.date, attendanceSince),
                ))
                : [],
        ]);

        const activePlayerCount = scopedPlayers.filter((player) => normalizeStatus(player.status ?? 'active') === 'active').length;
        // Superadmin (all clubs) has no team-id list: count every team.
        const teamCount = scope.teamIds?.length ?? (await db.select({ id: pgTeams.id }).from(pgTeams)).length;

        const inRange = (date: Date | null, start: Date, end: Date) => (date ? date >= start && date <= end : false);

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

        const totalIncome = postgresDocumentIncome + postgresPaymentIncome;
        const totalExpense = postgresDocumentExpense;
        const profit = totalIncome - totalExpense;

        const monthlyIncome = postgresMonthlyDocumentIncome + postgresMonthlyPaymentIncome;
        const monthlyExpense = postgresMonthlyDocumentExpense;
        const monthlyProfit = monthlyIncome - monthlyExpense;

        const previousMonthIncome = postgresPrevMonthDocumentIncome + postgresPrevMonthPaymentIncome;
        const incomeChangePercent = previousMonthIncome > 0
            ? Math.round(((monthlyIncome - previousMonthIncome) / previousMonthIncome) * 100)
            : null;

        const previousMonthExpense = postgresPrevMonthDocumentExpense;
        const previousMonthProfit = previousMonthIncome - previousMonthExpense;
        const profitChangePercent = previousMonthProfit !== 0
            ? Math.round(((monthlyProfit - previousMonthProfit) / Math.abs(previousMonthProfit)) * 100)
            : null;

        // Players who owe money, from the shared fee calculation (the same as
        // Finanțe → Restanțe). It used to count "pending" payment rows, which
        // the app no longer writes, so it sat at 0 while families owed money.
        const balances = scope.clubId != null ? await clubBalances(scope.clubId, { now }) : [];
        const pendingPaymentsCount = balances.filter((balance) => balance.outstanding > 0).length;

        const countedPgAttendanceRows = pgAttendanceRows.filter((row) => isCountedStatus(row.status));
        const postgresMonthlyAttendanceRows = countedPgAttendanceRows.filter((row) => {
            const date = toDate(row.date);
            return date ? date >= startOfMonth && date <= endOfMonth : false;
        });

        const presentCount = postgresMonthlyAttendanceRows.filter((row) => isPresentStatus(row.status)).length;
        const totalAttendanceRecords = postgresMonthlyAttendanceRows.length;

        const attendanceRate = totalAttendanceRecords > 0
            ? Math.round((presentCount / totalAttendanceRecords) * 100)
            : null;

        const prevMonthPgAttendanceRows = countedPgAttendanceRows.filter((row) => inRange(toDate(row.date), startOfPrevMonth, endOfPrevMonth));
        const previousPresentCount = prevMonthPgAttendanceRows.filter((row) => isPresentStatus(row.status)).length;
        const previousTotalAttendanceRecords = prevMonthPgAttendanceRows.length;
        const previousAttendanceRate = previousTotalAttendanceRecords > 0
            ? Math.round((previousPresentCount / previousTotalAttendanceRecords) * 100)
            : null;
        const attendanceChangePoints = attendanceRate != null && previousAttendanceRate != null
            ? attendanceRate - previousAttendanceRate
            : null;

        const newPlayersThisMonth = scopedPlayers.filter((player) => inRange(toDate(player.createdAt), startOfMonth, endOfMonth)).length;
        const newPlayersLastMonth = scopedPlayers.filter((player) => inRange(toDate(player.createdAt), startOfPrevMonth, endOfPrevMonth)).length;
        const playerCountChange = newPlayersThisMonth - newPlayersLastMonth;

        const todayTs = new Date();
        const in30Days = new Date();
        in30Days.setDate(todayTs.getDate() + 30);

        type MedicalCheckCandidate = {
            firstName?: string | null;
            lastName?: string | null;
            medicalCheckExpiry?: Date | string | null;
        };

        const medicalCheckCandidates: MedicalCheckCandidate[] = scopedPlayers;

        const expiredVisasItems = medicalCheckCandidates
            .filter((player) => {
                const expiry = toDate(player.medicalCheckExpiry);
                return expiry ? expiry.getTime() <= todayTs.getTime() : false;
            });

        type RiskItem = {
            type: string;
            name: string;
            /** null = already expired (clients render "EXPIRAT"). */
            daysLeft: number | null;
            expiryDate: string;
            urgent: boolean;
            expired?: boolean;
            daysOverdue?: number;
        };

        // Already-expired visas lead the list. They used to be COUNTED
        // (expiredVisasCount) but never LISTED — the list only held visas
        // expiring in the next 30 days — so the dashboard showed "2 EXPIRATE"
        // next to "Totul e în regulă".
        const expiredRiskItems: RiskItem[] = expiredVisasItems.map((player) => {
            const expiry = toDate(player.medicalCheckExpiry);
            const daysOverdue = expiry ? Math.max(0, Math.floor((todayTs.getTime() - expiry.getTime()) / 86400000)) : 0;
            return {
                type: 'VIZĂ MEDICALĂ',
                name: `${player.firstName ?? ''} ${player.lastName ?? ''}`.trim() || 'Jucător',
                daysLeft: null,
                expiryDate: expiry ? expiry.toLocaleDateString('ro-RO') : '',
                urgent: true,
                expired: true,
                daysOverdue,
            };
        });

        const expiringItems: RiskItem[] = medicalCheckCandidates
            .filter((player) => {
                const expiry = toDate(player.medicalCheckExpiry);
                // Strictly after today: "today" already counts as expired above.
                return expiry ? expiry.getTime() > todayTs.getTime() && expiry <= in30Days : false;
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

        const overdueBalances = balances.filter((balance) => balance.state === 'overdue');
        if (overdueBalances.length) {
            const oldest = overdueBalances
                .map((balance) => balance.oldestOverdue)
                .filter((date): date is string => Boolean(date))
                .sort()[0];
            const oldestDate = oldest ? new Date(oldest) : null;
            const overdueTotal = overdueBalances.reduce((sum, balance) => sum + balance.overdue, 0);
            expiredRiskItems.push({
                type: 'PLĂȚI RESTANTE',
                name: `${overdueBalances.length} ${overdueBalances.length === 1 ? 'jucător' : 'jucători'} · ${Math.round(overdueTotal).toLocaleString('ro-RO')} RON`,
                daysLeft: null,
                expiryDate: oldestDate ? oldestDate.toLocaleDateString('ro-RO') : '',
                urgent: true,
                expired: true,
                daysOverdue: oldestDate ? Math.max(0, Math.floor((todayTs.getTime() - oldestDate.getTime()) / 86400000)) : 0,
            });
        }

        // Fees falling due in the next two weeks (not yet late).
        const nextDue = balances
            .flatMap((balance) => balance.fees.filter((fee) => fee.status !== 'overdue' && fee.dueDate))
            .map((fee) => new Date(fee.dueDate as string))
            .filter((date) => date.getTime() >= todayTs.getTime())
            .sort((a, b) => a.getTime() - b.getTime())[0];
        const owingNotLate = balances.filter((balance) => balance.state === 'due').length;
        if (nextDue && owingNotLate > 0) {
            const daysLeft = Math.ceil((nextDue.getTime() - todayTs.getTime()) / 86400000);
            if (daysLeft <= 14) {
                expiringItems.push({
                    type: 'COTIZAȚIE LUNARĂ',
                    name: `${owingNotLate} ${owingNotLate === 1 ? 'plată de încasat' : 'plăți de încasat'}`,
                    daysLeft,
                    expiryDate: nextDue.toLocaleDateString('ro-RO'),
                    urgent: daysLeft <= 7,
                });
            }
        }

        expiringItems.sort((a, b) => (a.daysLeft ?? -Infinity) - (b.daysLeft ?? -Infinity));
        // Longest-overdue first, then the soonest to expire.
        expiredRiskItems.sort((a, b) => (b.daysOverdue ?? 0) - (a.daysOverdue ?? 0));
        const riskItems = [...expiredRiskItems, ...expiringItems];

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
            expiringItems: riskItems,
        });
    } catch (e) {
        console.error('[dashboard/summary] error:', e);
        res.status(500).json({ error: 'Failed to fetch dashboard summary' });
    }
});

export default router;
