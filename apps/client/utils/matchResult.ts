/**
 * Matches kept with the club's own scorer (GET /events attaches `game`, from
 * game_stats). FRB fixtures carry their score in the description instead;
 * these helpers cover the club's own sheet, so friendlies, municipal games and
 * tournaments get a result on Acasă too, plus the link to "Fișa meciului".
 * Pure, see matchResult.test.ts.
 */

export type EventGameSummary = {
  status: 'setup' | 'live' | 'finished';
  scoreUs: number;
  scoreThem: number;
  opponentName: string | null;
  finishedAt: string | null;
};

export type MatchOutcome = 'win' | 'loss' | 'draw';

type MatchLike = {
  id: number;
  type: string;
  title: string;
  status?: string | null;
  teamName?: string | null;
  opponent?: string | null;
  game?: EventGameSummary | null;
};

export type InternalResult = {
  us: number;
  them: number;
  ourName: string;
  theirName: string;
  outcome: MatchOutcome;
  /** "9 - 5", our score first. */
  label: string;
};

function fold(value: string | null | undefined) {
  return String(value ?? '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * The other side: what the scorer typed, else the match's own opponent field,
 * else the half of an "A vs B" title that isn't our team.
 */
export function opponentOf(event: MatchLike): string | null {
  const typed = event.game?.opponentName?.trim() || event.opponent?.trim();
  if (typed) return typed;
  const parts = event.title.split(/\s+vs\.?\s+/i).map((part) => part.trim()).filter(Boolean);
  if (parts.length !== 2) return null;
  const ours = fold(event.teamName);
  if (ours && fold(parts[0]) === ours) return parts[1];
  if (ours && fold(parts[1]) === ours) return parts[0];
  return null;
}

/** The result of a match the club's scorer finished; null for anything else. */
export function internalMatchResult(event: MatchLike): InternalResult | null {
  if (event.type !== 'match' || event.game?.status !== 'finished') return null;
  if (String(event.status ?? '').toLowerCase() === 'cancelled') return null;
  const us = Number(event.game.scoreUs);
  const them = Number(event.game.scoreThem);
  if (!Number.isFinite(us) || !Number.isFinite(them)) return null;
  return {
    us,
    them,
    ourName: event.teamName?.trim() || 'Echipa noastră',
    theirName: opponentOf(event) ?? 'Adversar',
    outcome: us === them ? 'draw' : us > them ? 'win' : 'loss',
    label: `${us} - ${them}`,
  };
}

type Role = string | null | undefined;

const ADMIN_SHELL_ROLES = new Set(['admin', 'superadmin', 'staff', 'accountant']);

/** The scorer/box-score route of each shell (App.tsx): /admin, /coach, or the member one. */
export function matchSheetPath(role: Role, eventId: number) {
  const value = String(role ?? '').toLowerCase();
  if (ADMIN_SHELL_ROLES.has(value)) return `/admin/stats/${eventId}`;
  if (value === 'coach') return `/coach/stats/${eventId}`;
  return `/stats/${eventId}`;
}

/**
 * Whether an event offers "Fișa meciului". Staff and coaches get it on every
 * club match (they may be the ones to start it); a player or parent only once
 * someone keeps statistics, so the link never opens an empty sheet.
 */
export function showMatchSheetLink(event: MatchLike, role: Role) {
  if (event.type !== 'match' || event.id <= 0) return false;
  if (String(event.status ?? '').toLowerCase() === 'cancelled') return false;
  const value = String(role ?? '').toLowerCase();
  if (value === 'player' || value === 'parent') return event.game != null && event.game.status !== 'setup';
  return true;
}
