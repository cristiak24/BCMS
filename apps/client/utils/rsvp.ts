import { tr } from '../i18n';
import { parseApiDate } from './dates';
import type { ResponseCounts, ResponseStatus } from '../services/eventResponsesApi';

/**
 * Attendance confirmation („Vin / Nu vin / Poate”, Val 3) — the client mirror
 * of server lib/eventResponses.ts. The answer is only information for the
 * coach: attendance is never filled in from it.
 */

export const RESPONSE_EVENT_TYPES = ['training', 'match', 'camp'] as const;

/** Whether players are asked about this event at all (same rule as the server). */
export function eventTakesResponses(event: { id?: number; type: string; teamId: number | null; status?: string | null } | null | undefined) {
  if (!event || event.teamId == null) return false;
  // Live FRB fixtures not in the calendar carry made-up negative ids.
  if (event.id != null && event.id <= 0) return false;
  if (!(RESPONSE_EVENT_TYPES as readonly string[]).includes(event.type)) return false;
  return String(event.status ?? '').toLowerCase() !== 'cancelled';
}

/** Answers are taken until the event starts. */
export function responsesOpen(startTime: string | null | undefined, now: number = Date.now()) {
  if (!startTime) return false;
  const start = parseApiDate(startTime).getTime();
  return Number.isFinite(start) && now < start;
}

/**
 * Who the label speaks for: the player answers for themself („Vin”), a parent
 * for their child and the staff read about a player („Vine”).
 */
export type ResponseVoice = 'self' | 'third';

/**
 * „Vin” on its own is already in the dictionary as the weekday („Vin” = Fri),
 * so the answer goes through its own key and falls back to the plain word.
 */
export function goingWord() {
  const key = 'Vin · răspuns';
  const out = tr(key);
  return out === key ? 'Vin' : out;
}

export function responseLabel(status: ResponseStatus, voice: ResponseVoice) {
  if (status === 'going') return voice === 'self' ? goingWord() : tr('Vine');
  if (status === 'not_going') return voice === 'self' ? tr('Nu vin') : tr('Nu vine');
  return tr('Poate');
}

export function responseQuestion(childFirstName?: string | null) {
  return childFirstName ? tr('Participă {0}?', { '0': childFirstName }) : tr('Participi?');
}

export const RESPONSE_META: Record<ResponseStatus, { icon: string; fg: string; bg: string; solid: string }> = {
  going: { icon: 'check', fg: 'var(--c-success-fg)', bg: 'var(--c-success-bg)', solid: 'var(--c-success)' },
  not_going: { icon: 'close', fg: 'var(--c-danger-fg)', bg: 'var(--c-danger-bg)', solid: 'var(--c-danger)' },
  maybe: { icon: 'help-outline', fg: 'var(--c-ink-soft)', bg: 'var(--c-surface-3)', solid: 'var(--c-border-strong)' },
};

export const RESPONSE_ORDER: ResponseStatus[] = ['going', 'not_going', 'maybe'];

/** „Vin 9 · Nu vin 2 · Poate 1 · Fără răspuns 2” */
export function countsLine(counts: ResponseCounts) {
  return tr('Vin {0} · Nu vin {1} · Poate {2} · Fără răspuns {3}', {
    '0': counts.going, '1': counts.notGoing, '2': counts.maybe, '3': counts.none,
  });
}

/** Staff rows grouped by what needs attention first: Nu vin, Poate, Fără răspuns, Vin. */
export function groupStaffRows<T extends { status: ResponseStatus | null }>(rows: T[]) {
  return [
    { key: 'not_going' as const, rows: rows.filter((row) => row.status === 'not_going') },
    { key: 'maybe' as const, rows: rows.filter((row) => row.status === 'maybe') },
    { key: 'none' as const, rows: rows.filter((row) => row.status == null) },
    { key: 'going' as const, rows: rows.filter((row) => row.status === 'going') },
  ].filter((group) => group.rows.length > 0);
}

export const REASON_MAX_LENGTH = 200;
