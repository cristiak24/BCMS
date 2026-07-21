// dashboardApi.ts — Agregat KPI-uri pentru dashboard
// Apelează /api/dashboard/summary care agregă date din finance + players + attendance + compliance
import { apiFetch } from './apiClient';

export interface ExpiringItem {
    type: 'VIZĂ MEDICALĂ' | 'LICENȚĂ JUCĂTOR' | 'COTIZAȚIE LUNARĂ';
    name: string;
    daysLeft: number | null;
    expiryDate: string;
    urgent: boolean;  // true dacă mai sunt <= 7 zile
}

export interface DashboardSummary {
    activePlayerCount: number;
    playerCountChange: number;  // jucători noi luna asta minus jucători noi luna trecută
    teamCount: number;
    totalIncome: number;        // venituri totale procesate (facturi + cotizații), fără cheltuieli
    monthlyIncome: number;      // venituri luna curentă
    totalExpense: number;       // cheltuieli totale procesate
    monthlyExpense: number;     // cheltuieli luna curentă
    profit: number;             // totalIncome - totalExpense
    monthlyProfit: number;      // monthlyIncome - monthlyExpense
    previousMonthIncome: number;
    incomeChangePercent: number | null; // % față de luna trecută, null dacă nu există bază de comparație
    profitChangePercent: number | null;
    pendingPaymentsCount: number;
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
