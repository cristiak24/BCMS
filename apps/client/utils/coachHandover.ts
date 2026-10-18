/**
 * Deactivating a coach who still leads teams: the server answers 409
 * `coach_has_teams` with the teams and who could take them
 * (apps/server/src/lib/coachHandover.ts); the admin picks someone, or "nobody
 * for now", and the deactivation is sent again. Pure, see coachHandover.test.ts.
 */

export type HandoverRequest = {
  message: string;
  teams: { id: number; name: string }[];
  candidates: { id: number; name: string; role: string }[];
};

/** The handover step a failed deactivation asks for, or null for any other error. */
export function readHandoverRequest(error: unknown): HandoverRequest | null {
  const e = error as { status?: unknown; data?: unknown; message?: unknown } | null;
  if (!e || e.status !== 409) return null;
  const data = (e.data ?? {}) as Record<string, unknown>;
  if (data.code !== 'coach_has_teams' || !Array.isArray(data.teams)) return null;
  return {
    message: typeof data.error === 'string' ? data.error : String(e.message ?? ''),
    teams: data.teams as HandoverRequest['teams'],
    candidates: Array.isArray(data.candidates) ? (data.candidates as HandoverRequest['candidates']) : [],
  };
}

/** SelectField key ↔ the API's `teamsReassignTo`. */
export const NOBODY = 'none';
export function handoverTarget(key: string): number | null {
  return key === NOBODY ? null : Number(key);
}
