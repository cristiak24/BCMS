import { useSyncExternalStore } from 'react';
import { eventResponsesApi, type MyEventResponse, type ResponseStatus } from '../services/eventResponsesApi';

/**
 * The player's own „Vin / Nu vin / Poate” answers (a parent: the selected
 * child's), shared by Acasă, Program and the event sheet: an answer given in
 * the sheet shows on the row behind it at once. Kept in memory only.
 */

type Snapshot = ReadonlyMap<number, MyEventResponse>;

let answers: Snapshot = new Map();
const listeners = new Set<() => void>();

function publish(next: Map<number, MyEventResponse>) {
  answers = next;
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

const getSnapshot = () => answers;

/** Answers for events starting in [from, to]; replaces what was loaded before. */
export async function loadMyResponses(from: Date, to: Date) {
  const rows = await eventResponsesApi.mine({ from: from.toISOString(), to: to.toISOString() });
  publish(new Map(rows.map((row) => [row.eventId, row])));
}

/** Forget everything (another child picked, signed out). */
export function clearMyResponses() {
  publish(new Map());
}

/**
 * Save an answer. The row changes at once and goes back if the server says no;
 * the error is rethrown for the caller to show.
 */
export async function saveMyResponse(eventId: number, status: ResponseStatus, reason: string | null) {
  const before = answers.get(eventId);
  const optimistic = new Map(answers);
  optimistic.set(eventId, {
    eventId,
    status,
    reason: status === 'not_going' ? reason : null,
    respondedByName: null,
    updatedAt: new Date().toISOString(),
  });
  publish(optimistic);
  try {
    const saved = await eventResponsesApi.respond(eventId, status, reason);
    const next = new Map(answers);
    next.set(eventId, saved);
    publish(next);
    return saved;
  } catch (error) {
    const next = new Map(answers);
    if (before) next.set(eventId, before);
    else next.delete(eventId);
    publish(next);
    throw error;
  }
}

export function useMyResponses(): Snapshot {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
