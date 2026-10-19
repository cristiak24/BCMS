/**
 * Display helpers for season statistics (server lib/seasonStats.ts computes
 * them). Romanian decimals ("8,5"), "—" for nothing to show.
 */

export function formatStat(value: number | null | undefined) {
  if (value == null || Number.isNaN(value)) return '—';
  return Number.isInteger(value) ? String(value) : value.toLocaleString('ro-RO', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

export function formatPct(value: number | null | undefined) {
  return value == null ? '—' : `${value}%`;
}

export type SeasonSortKey = 'pts' | 'reb' | 'ast' | 'games' | 'ptsTotal';

type Row = {
  firstName: string;
  lastName: string;
  games: number;
  averages: { pts: number | null; reb: number | null; ast: number | null };
  totals: { pts: number };
};

function valueOf(row: Row, key: SeasonSortKey) {
  if (key === 'games') return row.games;
  if (key === 'ptsTotal') return row.totals.pts;
  return row.averages[key];
}

/** Highest first; rows with nothing to show sink to the bottom; ties by name. */
export function sortSeasonRows<T extends Row>(rows: T[], key: SeasonSortKey): T[] {
  return [...rows].sort((a, b) => {
    const av = valueOf(a, key);
    const bv = valueOf(b, key);
    if (av == null && bv != null) return 1;
    if (bv == null && av != null) return -1;
    if (av != null && bv != null && av !== bv) return bv - av;
    return `${a.lastName} ${a.firstName}`.localeCompare(`${b.lastName} ${b.firstName}`, 'ro');
  });
}
