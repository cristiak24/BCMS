import { useSession } from '../../context/AuthContext';
import { normalizeRole } from '../../utils/authSession';
import { useMyResponses } from '../../hooks/useMyResponses';
import { eventTakesResponses, responsesOpen, type ResponseVoice } from '../../utils/rsvp';
import type { CalendarEvent } from '../../services/eventsApi';
import type { ResponseStatus } from '../../services/eventResponsesApi';

/**
 * Whether a schedule row shows the player's own answer, and which. Players and
 * parents only (the coach sees the same rows without it): while answers are
 * open, or the answer given once they closed.
 */
export function useRsvpState(event: Pick<CalendarEvent, 'id' | 'type' | 'teamId' | 'status' | 'startTime'>): {
  show: boolean;
  status: ResponseStatus | null;
  open: boolean;
  voice: ResponseVoice;
} {
  const { session } = useSession();
  const role = normalizeRole(session?.role);
  const answers = useMyResponses();
  const playerFacing = role === 'player' || role === 'parent';
  const takes = playerFacing && eventTakesResponses(event);
  const status = takes ? answers.get(event.id)?.status ?? null : null;
  const open = takes && responsesOpen(event.startTime);
  return { show: open || status != null, status, open, voice: role === 'parent' ? 'third' : 'self' };
}
