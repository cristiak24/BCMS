import type { FamilyJoinRequest, JoinSuggestion } from '../services/familyRequestsApi';
import { plural } from './plural';

/**
 * How a club reviews a team-code join request (components/family/
 * FamilyRequestsPanel.tsx). A same-name child already in the club is shown,
 * never chosen for the reviewer: a name and a birth year are no proof, and
 * "Leagă de …" preselected let a stranger's request be approved onto someone
 * else's child in one click (audit R3-7). Pure, see joinRequestReview.test.ts.
 */

/** "2015-03-14" → "14.03.2015"; "2015" (year only) stays "2015". */
export function formatBirth(date: string | null | undefined) {
  if (!date) return '';
  const [y, m, d] = date.split('-');
  return m && d ? `${d}.${m}.${y}` : y;
}

/** Always "Jucător nou" — linking to an existing player is a deliberate choice. */
export function defaultTarget(_request: FamilyJoinRequest): number | 'new' {
  return 'new';
}

export function hasRosterMatch(request: FamilyJoinRequest) {
  return request.suggestions.length > 0;
}

/** What "Aprobă toți" may approve: requests nobody in the club shares a name with. */
export function autoApprovableIds(requests: FamilyJoinRequest[]) {
  return requests.filter((request) => !hasRosterMatch(request)).map((request) => request.id);
}

function playerName(s: JoinSuggestion) {
  return `${s.firstName ?? ''} ${s.lastName ?? ''}`.trim() || 'Jucătorul';
}

/** Reasons to look twice before linking this request to `s`, in plain Romanian. */
export function matchWarnings(request: FamilyJoinRequest, s: JoinSuggestion) {
  const warnings: string[] = [];
  if (request.kind === 'parent' && s.guardians > 0) {
    warnings.push(`${playerName(s)} are deja ${s.guardians === 1 ? 'un părinte legat' : plural(s.guardians, 'părinte legat', 'părinți legați')}.`);
  }
  if (request.kind === 'player' && s.hasAccount) {
    warnings.push(`${playerName(s)} are deja un cont de jucător.`);
  }
  if (s.birthMismatch) {
    const onFile = s.birthDate ? formatBirth(s.birthDate) : s.birthYear != null ? String(s.birthYear) : '';
    warnings.push(`Data nașterii diferă: în cerere ${formatBirth(request.child.birthDate) || '—'}, în club ${onFile || '—'}.`);
  }
  return warnings;
}

/** The deny confirmation: only an account that is still waiting stays without access. */
export function denyMessage(request: FamilyJoinRequest) {
  const child = `${request.child.firstName} ${request.child.lastName}`;
  if (request.requester.status === 'pending') {
    return 'Contul rămâne în așteptare, fără acces la echipă.';
  }
  return request.kind === 'parent'
    ? `${request.requester.name} nu va fi legat de ${child}. Contul rămâne activ, cu accesul pe care îl are deja.`
    : `${request.requester.name} nu intră în ${request.team.name}. Contul rămâne activ, cu accesul pe care îl are deja.`;
}
