import type { L12Lineup } from '../services/l12Api';

/**
 * Formular L-12 before it goes to the referee — pure, see l12Export.test.ts.
 *
 * The sheet printed the event's title where the opponent goes ("U12 Masculin
 * vs. Turneu de toamnă"), and exported with shirt numbers missing, no captain
 * and no head coach although the team has a coach (audit L12). The opponent
 * now comes from the match (events.opponent), a sheet with gaps needs an
 * explicit "export anyway", and a new sheet starts with the team's coach.
 */

function stripKindPrefix(title: string) {
  return title.replace(/^\s*(meci\s+)?(amical|municipal)\s*[:·–-]?\s*/i, '');
}

/**
 * Home/away for "Jocul: … vs. …". A title with both sides ("A vs B", how FRB
 * fixtures are named) wins; otherwise our team against the match's opponent;
 * with neither, the away side stays blank — never the event title.
 */
export function resolveMatchSides(title: string, teamName: string, opponent: string | null | undefined) {
  const parts = stripKindPrefix(title).split(/\s+vs\.?\s+/i).map((part) => part.trim()).filter(Boolean);
  if (parts.length === 2) return { homeTeam: parts[0], awayTeam: parts[1] };
  return { homeTeam: teamName, awayTeam: opponent?.trim() ?? '' };
}

/** What is still missing on a printable sheet, in the words of the confirmation. */
export function exportGaps(lineup: L12Lineup, opts: { awayTeam: string }) {
  const gaps: string[] = [];
  const missingNumbers = lineup.players.filter((player) => !String(player.shirtNumber ?? '').trim()).length;
  if (missingNumbers) gaps.push(missingNumbers === 1 ? '1 jucător fără număr de echipament' : `${missingNumbers} jucători fără număr de echipament`);
  if (lineup.players.length && lineup.captainPlayerId == null) gaps.push('niciun căpitan ales');
  if (!lineup.staff.headCoach?.name?.trim()) gaps.push('fără antrenor principal');
  if (!opts.awayTeam.trim()) gaps.push('adversarul nu e completat');
  return gaps;
}

/** A sheet without a head coach starts with the team's assigned coach. */
export function withTeamCoach(lineup: L12Lineup, coachName: string | null | undefined): L12Lineup {
  const name = coachName?.trim();
  if (!name || lineup.staff.headCoach?.name?.trim()) return lineup;
  return { ...lineup, staff: { ...lineup.staff, headCoach: { name, license: lineup.staff.headCoach?.license ?? '' } } };
}
