import { useCallback, useEffect, useRef, useState } from 'react';
import type { AttendanceMark } from '../utils/attendanceStatus';
import { isNetworkError } from '../utils/networkRetry';

/**
 * Attendance marks that didn't reach the server because there was no
 * connection (a gym with no signal) or the API was still waking up. They stay
 * on screen and on the device (localStorage, per event, like the live scorer's
 * events) and go out on their own when the connection returns — on `online`,
 * every 20 s while any wait, and when the sheet is opened again.
 *
 * A mark the server refuses (4xx) is not queued: the caller rolls it back.
 */

const keyFor = (eventId: number) => `bcms.attendance.pending.${eventId}`;

export function readPendingMarks(eventId: number): Map<number, AttendanceMark> {
  try {
    const raw = localStorage.getItem(keyFor(eventId));
    if (!raw) return new Map();
    const parsed = JSON.parse(raw) as Record<string, AttendanceMark>;
    return new Map(Object.entries(parsed).map(([id, status]) => [Number(id), status]));
  } catch {
    return new Map();
  }
}

function writePendingMarks(eventId: number, marks: Map<number, AttendanceMark>) {
  try {
    if (marks.size === 0) localStorage.removeItem(keyFor(eventId));
    else localStorage.setItem(keyFor(eventId), JSON.stringify(Object.fromEntries(marks)));
  } catch { /* storage full or blocked: the marks still wait in memory */ }
}

/** No answer, or the server is down/booting: worth sending again later. */
export function isRetryableSaveError(error: unknown) {
  const status = (error as { status?: unknown })?.status;
  if (typeof status === 'number' && status >= 500) return true;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true;
  return isNetworkError(error);
}

const RETRY_MS = 20_000;

function failureReason(error: unknown): 'offline' | 'server' {
  const status = (error as { status?: unknown })?.status;
  const online = typeof navigator === 'undefined' || navigator.onLine !== false;
  return online && typeof status === 'number' && status >= 500 ? 'server' : 'offline';
}

export function useAttendanceOutbox(
  eventId: number | null,
  send: (marks: { id: number; status: AttendanceMark }[]) => Promise<void>,
  onRejected: (error: unknown, marks: { id: number; status: AttendanceMark }[]) => void,
) {
  const [pending, setPending] = useState<Map<number, AttendanceMark>>(new Map());
  // Why the last send failed: no connection, or the server answering 5xx while online.
  const [reason, setReason] = useState<'offline' | 'server'>('offline');
  const pendingRef = useRef(pending);
  const flushing = useRef(false);
  const sendRef = useRef(send);
  const rejectRef = useRef(onRejected);
  sendRef.current = send;
  rejectRef.current = onRejected;

  const commit = useCallback((next: Map<number, AttendanceMark>) => {
    pendingRef.current = next;
    setPending(next);
    if (eventId !== null) writePendingMarks(eventId, next);
  }, [eventId]);

  useEffect(() => {
    if (eventId === null) return;
    const stored = readPendingMarks(eventId);
    pendingRef.current = stored;
    setPending(stored);
  }, [eventId]);

  const queue = useCallback((marks: { id: number; status: AttendanceMark }[], error?: unknown) => {
    setReason(failureReason(error));
    const next = new Map(pendingRef.current);
    marks.forEach((mark) => next.set(mark.id, mark.status));
    commit(next);
  }, [commit]);

  /** A mark saved directly supersedes the one waiting for the same player. */
  const drop = useCallback((ids: number[]) => {
    if (!ids.some((id) => pendingRef.current.has(id))) return;
    const next = new Map(pendingRef.current);
    ids.forEach((id) => next.delete(id));
    commit(next);
  }, [commit]);

  const flush = useCallback(async () => {
    if (flushing.current || pendingRef.current.size === 0) return;
    flushing.current = true;
    const batch = Array.from(pendingRef.current, ([id, status]) => ({ id, status }));
    try {
      await sendRef.current(batch);
      // Marks tapped while this batch was in flight stay queued.
      const next = new Map(pendingRef.current);
      batch.forEach((mark) => { if (next.get(mark.id) === mark.status) next.delete(mark.id); });
      commit(next);
    } catch (error) {
      if (isRetryableSaveError(error)) setReason(failureReason(error));
      if (!isRetryableSaveError(error)) {
        const next = new Map(pendingRef.current);
        batch.forEach((mark) => next.delete(mark.id));
        commit(next);
        rejectRef.current(error, batch);
      }
    } finally {
      flushing.current = false;
    }
  }, [commit]);

  const count = pending.size;
  useEffect(() => {
    if (count === 0 || typeof window === 'undefined') return undefined;
    const onOnline = () => { void flush(); };
    window.addEventListener('online', onOnline);
    const timer = window.setInterval(() => { void flush(); }, RETRY_MS);
    return () => {
      window.removeEventListener('online', onOnline);
      window.clearInterval(timer);
    };
  }, [count, flush]);

  return { pending, reason, queue, drop, flush };
}
