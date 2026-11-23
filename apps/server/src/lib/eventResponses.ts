import { toDate } from './dateUtils';

/**
 * Attendance confirmation („Vin / Nu vin / Poate”, Val 3). A player — or a
 * parent for the selected child — answers before a training, match or camp
 * starts. The answer is only information for the coach: attendance stays the
 * coach's own record and is never filled in from it.
 */

export const RESPONSE_STATUSES = ['going', 'not_going', 'maybe'] as const;
export type ResponseStatus = (typeof RESPONSE_STATUSES)[number];

/** Event types a player is asked about. Meetings and medical visits are not. */
export const RESPONSE_EVENT_TYPES = ['training', 'match', 'camp'] as const;

export const REASON_MAX_LENGTH = 200;

/** One reminder per event in this window. */
export const REMINDER_COOLDOWN_MS = 12 * 60 * 60 * 1000;

export const RESPONSES_CLOSED_MESSAGE = 'Confirmările s-au închis la ora de început.';

export function isResponseStatus(value: unknown): value is ResponseStatus {
    return typeof value === 'string' && (RESPONSE_STATUSES as readonly string[]).includes(value);
}

/** Whether players are asked about this event at all. */
export function eventTakesResponses(event: { type: unknown; teamId: unknown; status?: unknown }) {
    return event.teamId != null
        && (RESPONSE_EVENT_TYPES as readonly string[]).includes(String(event.type))
        && String(event.status ?? '').toLowerCase() !== 'cancelled';
}

/**
 * Answers are taken until the event starts. Start times are UTC instants, so
 * the comparison is the same whatever the zone — 18:00 in Bucharest is 18:00
 * there. An event with no usable start can't be judged, so it is closed.
 */
export function responsesOpen(startTime: unknown, now: Date = new Date()) {
    const start = toDate(startTime);
    return start != null && now.getTime() < start.getTime();
}

export type ResponseInput = { status: ResponseStatus; reason: string | null };

/**
 * The request body of PUT /events/:id/response. The reason is kept only with
 * „Nu vin”: any other answer clears it.
 */
export function parseResponseInput(body: unknown): { ok: true; value: ResponseInput } | { ok: false; error: string } {
    const raw = (body ?? {}) as { status?: unknown; reason?: unknown };
    if (!isResponseStatus(raw.status)) {
        return { ok: false, error: 'Alege „Vin”, „Nu vin” sau „Poate”.' };
    }
    if (raw.reason != null && typeof raw.reason !== 'string') {
        return { ok: false, error: 'Motivul trebuie să fie text.' };
    }
    const reason = raw.status === 'not_going' ? (raw.reason ?? '').replace(/\s+/g, ' ').trim() : '';
    if (reason.length > REASON_MAX_LENGTH) {
        return { ok: false, error: `Motivul poate avea cel mult ${REASON_MAX_LENGTH} de caractere.` };
    }
    return { ok: true, value: { status: raw.status, reason: reason || null } };
}

export type ResponseCounts = { going: number; notGoing: number; maybe: number; none: number };

export function countResponses(statuses: Array<string | null | undefined>): ResponseCounts {
    const counts: ResponseCounts = { going: 0, notGoing: 0, maybe: 0, none: 0 };
    for (const status of statuses) {
        if (status === 'going') counts.going += 1;
        else if (status === 'not_going') counts.notGoing += 1;
        else if (status === 'maybe') counts.maybe += 1;
        else counts.none += 1;
    }
    return counts;
}

/**
 * The coach hears about a „Nu vin” once per player and event: only when the
 * answer becomes „Nu vin”, and never again for the same event and player
 * (an answer flipped back and forth doesn't send a message each time).
 */
export function shouldNotifyDecline(previous: string | null | undefined, next: ResponseStatus, alreadyNotified: boolean) {
    return next === 'not_going' && previous !== 'not_going' && !alreadyNotified;
}

/** „antrenamentul”, „meciul”… — the event named inside a sentence. */
export function eventNoun(type: unknown) {
    if (type === 'match') return 'meciul';
    if (type === 'camp') return 'cantonamentul';
    return 'antrenamentul';
}
