// dashboardApi.ts — Agregat KPI-uri pentru dashboard
// Apelează /api/dashboard/summary care agregă date din finance + players + attendance + compliance
import { apiFetch } from './apiClient';

export interface ExpiringItem {
    type: 'VIZĂ MEDICALĂ' | 'LICENȚĂ JUCĂTOR' | 'COTIZAȚIE LUNARĂ';
    name: string;
    daysLeft: number | null;
    expiryDate: string;
    urgent: boolean;  // true dacă mai sunt <= 7 zile
    /** Already past its expiry date (daysLeft is null then). */
    expired?: boolean;
    daysOverdue?: number;
}

export interface DashboardSummary {
    activePlayerCount: number;
    playerCountChange: number;  // jucători noi luna asta minus jucători noi luna trecută
    /** Players added this calendar month. */
    newPlayersThisMonth?: number;
    teamCount: number;
    totalIncome: number;        // venituri totale procesate (facturi + cotizații), fără cheltuieli
    monthlyIncome: number;      // venituri luna curentă
    totalExpense: number;       // cheltuieli totale procesate
    monthlyExpense: number;     // cheltuieli luna curentă
    profit: number;             // totalIncome - totalExpense
    monthlyProfit: number;      // monthlyIncome - monthlyExpense
    previousMonthIncome: number;
    incomeChangePercent: number | null; // % față de luna trecută, null dacă nu există bază de comparație
    /** Fees collected this month, and what should be in by month-end (older servers: absent). */
    feesCollectedThisMonth?: number;
    feesDueByMonthEnd?: number;
    profitChangePercent: number | null;
    /** Players with something past due (restanță). */
    pendingPaymentsCount: number;
    /** Players who owe anything, due or not (de plată). Absent on older servers. */
    owingPlayersCount?: number;
    attendanceRate: number | null;   // procent 0-100, null dacă nu există date
    previousAttendanceRate: number | null;
    attendanceChangePoints: number | null; // diferență în puncte procentuale față de luna trecută
    presentCount: number;
    totalAttendanceRecords: number;
    expiredVisasCount: number;
    expiringItems: ExpiringItem[];
}

export const dashboardApi = {
    getSummary: (): Promise<DashboardSummary> =>
        apiFetch<DashboardSummary>('/dashboard/summary'),
};
