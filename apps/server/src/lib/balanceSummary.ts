/**
 * The Finanțe list row for one player: the totals of the shared fee
 * calculation (services/clubFinance.ts) without the fee-by-fee detail.
 * The detail of a whole club (~24 months × 3 fees × 300 players) was 1.5–3.5
 * MB on every visit to Finanțe (audit P2); the dialog that needs it asks for
 * one player at a time. Pure, see balanceSummary.test.ts.
 */
import type { ComputedFee, FeeTotals } from './feeSchedule';

type Balance = {
    playerId: number;
    playerName: string;
    teamName: string | null;
    status: string;
    fees: ComputedFee[];
    credit: number;
} & FeeTotals;

export type BalanceSummary = Omit<Balance, 'fees'> & {
    /** Fees still owed (what the full list would hold). */
    feeCount: number;
    /** Earliest due date among them, overdue or not. */
    oldestDueDate: string | null;
};

export function summarizeBalance({ fees, ...totals }: Balance): BalanceSummary {
    return {
        ...totals,
        feeCount: fees.length,
        oldestDueDate: fees.map((fee) => fee.dueDate).filter((date): date is string => Boolean(date)).sort()[0] ?? null,
    };
}

/** Finanțe's order: most overdue first, then most owed, then by name. */
export function compareBalances(a: Pick<Balance, 'overdue' | 'outstanding' | 'playerName'>, b: Pick<Balance, 'overdue' | 'outstanding' | 'playerName'>) {
    return b.overdue - a.overdue || b.outstanding - a.outstanding || a.playerName.localeCompare(b.playerName);
}
