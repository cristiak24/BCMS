/**
 * The one place a player's roster status (`players.status`, free text in the
 * DB: 'active' / 'inactive', plus older values) becomes Romanian. The coach's
 * Echipe and team pages printed the raw value ("active").
 */
const PLAYER_STATUS_LABELS: Record<string, string> = {
  active: 'Activ',
  inactive: 'Inactiv',
  injured: 'Accidentat',
  suspended: 'Suspendat',
  pending: 'În așteptare',
  archived: 'Arhivat',
};

export function playerStatusLabel(status: string | null | undefined): string {
  const key = (status ?? '').trim().toLowerCase();
  if (!key) return PLAYER_STATUS_LABELS.active;
  return PLAYER_STATUS_LABELS[key] ?? 'Status necunoscut';
}

/** The options a status picker offers. */
export const PLAYER_STATUS_OPTIONS: { key: string; label: string }[] = [
  { key: 'active', label: PLAYER_STATUS_LABELS.active },
  { key: 'inactive', label: PLAYER_STATUS_LABELS.inactive },
];
