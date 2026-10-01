import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { gamesApi, type Game } from '../../services/gamesApi';
import { computeBoxScore, type EventType, type GameEvent, type Side } from '../../utils/gameStats';

/**
 * The scorer's engine. Events are kept on the device first (localStorage) and
 * pushed in small batches — a gym's signal comes and goes, and a closed tab or
 * a dead battery must not lose a quarter. Everything on screen is derived from
 * the event list via computeBoxScore.
 */

type Clock = { period: number; remainingMs: number; running: boolean; startedAt: number | null };
type Stored = { events: GameEvent[]; pending: string[]; clock: Clock; seq: number };

const keyFor = (eventId: number) => `bcms.game.${eventId}`;

function read(eventId: number): Stored | null {
  try {
    const raw = localStorage.getItem(keyFor(eventId));
    return raw ? JSON.parse(raw) as Stored : null;
  } catch {
    return null;
  }
}

function write(eventId: number, value: Stored) {
  try {
    localStorage.setItem(keyFor(eventId), JSON.stringify(value));
  } catch {
    // Storage full or blocked: the in-memory copy still syncs.
  }
}

export function clearScorerCache(eventId: number) {
  try { localStorage.removeItem(keyFor(eventId)); } catch { /* ignore */ }
}

function newClientId() {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

export function remainingMs(clock: Clock, now = Date.now()) {
  return clock.running && clock.startedAt != null ? Math.max(0, clock.remainingMs - (now - clock.startedAt)) : clock.remainingMs;
}

export function useScorer(eventId: number, game: Game, serverEvents: GameEvent[]) {
  const periodMs = (game.periodSec ?? 0) * 1000;
  const timed = game.periodSec != null;

  const [state, setState] = useState<Stored>(() => {
    const local = read(eventId);
    // Merge: server events plus anything this device hasn't sent yet.
    const byId = new Map(serverEvents.map((e) => [e.clientId, e]));
    const pending = local?.pending ?? [];
    local?.events.filter((e) => pending.includes(e.clientId)).forEach((e) => byId.set(e.clientId, e));
    const events = Array.from(byId.values()).sort((a, b) => a.seq - b.seq);
    const seq = Math.max(0, ...events.map((e) => e.seq)) + 1;
    const lastPeriod = Math.max(game.currentPeriod, ...events.map((e) => e.period), 1);
    return {
      events,
      pending,
      seq,
      clock: local?.clock ?? { period: lastPeriod, remainingMs: game.clockSec != null ? game.clockSec * 1000 : periodMs, running: false, startedAt: null },
    };
  });
  const [syncing, setSyncing] = useState(false);
  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine));
  const [lastError, setLastError] = useState<string | null>(null);
  const [, setTick] = useState(0);
  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => { write(eventId, state); }, [eventId, state]);

  // Clock display refresh.
  useEffect(() => {
    if (!state.clock.running) return undefined;
    const id = window.setInterval(() => {
      setTick((t) => t + 1);
      if (remainingMs(stateRef.current.clock) === 0) {
        setState((s) => ({ ...s, clock: { ...s.clock, running: false, remainingMs: 0, startedAt: null } }));
      }
    }, 250);
    return () => window.clearInterval(id);
  }, [state.clock.running]);

  const clockSecNow = useCallback(() => (timed ? Math.ceil(remainingMs(stateRef.current.clock) / 1000) : null), [timed]);

  /** Sends what this device still holds; resolves to how many actions are still unsent. */
  const flushing = useRef(false);
  const flush = useCallback(async (): Promise<number> => {
    const current = stateRef.current;
    if (!current.pending.length) return 0;
    if (flushing.current) return current.pending.length;
    const batch = current.events.filter((e) => current.pending.includes(e.clientId));
    flushing.current = true;
    setSyncing(true);
    try {
      const result = await gamesApi.push(eventId, batch, { period: current.clock.period, clockSec: clockSecNow() });
      const done = new Set([...result.acked, ...result.rejected.map((r) => r.clientId)]);
      const rejected = new Set(result.rejected.map((r) => r.clientId));
      const next: Stored = {
        ...stateRef.current,
        pending: stateRef.current.pending.filter((id) => !done.has(id)),
        // A rejected action never counted on the server — drop it here too.
        events: stateRef.current.events.map((e) => (rejected.has(e.clientId) ? { ...e, deleted: true } : e)),
      };
      stateRef.current = next;
      setState(next);
      setLastError(result.rejected[0]?.error ?? null);
      return next.pending.length;
    } catch (err) {
      setLastError(err instanceof Error ? err.message : 'Fără conexiune');
      return stateRef.current.pending.length;
    } finally {
      flushing.current = false;
      setSyncing(false);
    }
  }, [eventId, clockSecNow]);

  // Push every few seconds and whenever the connection comes back.
  useEffect(() => {
    const id = window.setInterval(() => { void flush(); }, 3000);
    const up = () => { setOnline(true); void flush(); };
    const down = () => setOnline(false);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    return () => {
      window.clearInterval(id);
      window.removeEventListener('online', up);
      window.removeEventListener('offline', down);
    };
  }, [flush]);

  type Input = { type: EventType; side?: Side; playerId?: number | null; otherPlayerId?: number | null; oppNumber?: string | null };

  const makeEvent = (s: Stored, input: Input, seq: number, period = s.clock.period, clockSec?: number | null): GameEvent => ({
    clientId: newClientId(),
    seq,
    period,
    clockSec: clockSec !== undefined ? clockSec : timed ? Math.ceil(remainingMs(s.clock) / 1000) : null,
    side: input.side ?? 'us',
    playerId: input.playerId ?? null,
    otherPlayerId: input.otherPlayerId ?? null,
    oppNumber: input.oppNumber ?? null,
    type: input.type,
    deleted: false,
  });

  const add = useCallback((input: Input) => {
    const s = stateRef.current;
    const event = makeEvent(s, input, s.seq);
    const next = { ...s, seq: s.seq + 1, events: [...s.events, event], pending: [...s.pending, event.clientId] };
    // The ref moves now so a flush right after an add (e.g. "Încheie meciul") sends it.
    stateRef.current = next;
    setState(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timed]);

  /** Undo the last scoring/stat action (period markers and subs included). */
  const undo = useCallback(() => {
    setState((s) => {
      const last = [...s.events].reverse().find((e) => !e.deleted && e.type !== 'period_start');
      if (!last) return s;
      return {
        ...s,
        events: s.events.map((e) => (e.clientId === last.clientId ? { ...e, deleted: true } : e)),
        pending: s.pending.includes(last.clientId) ? s.pending : [...s.pending, last.clientId],
      };
    });
  }, []);

  const toggleClock = useCallback(() => {
    setState((s) => {
      const now = Date.now();
      return s.clock.running
        ? { ...s, clock: { ...s.clock, running: false, remainingMs: remainingMs(s.clock, now), startedAt: null } }
        : { ...s, clock: { ...s.clock, running: s.clock.remainingMs > 0, startedAt: now } };
    });
  }, []);

  /** Close the current period and open the next one — both events in one update. */
  const nextPeriod = useCallback(() => {
    setState((s) => {
      const end = makeEvent(s, { type: 'period_end' }, s.seq);
      const start = makeEvent(s, { type: 'period_start' }, s.seq + 1, s.clock.period + 1, timed ? game.periodSec : null);
      return {
        ...s,
        seq: s.seq + 2,
        events: [...s.events, end, start],
        pending: [...s.pending, end.clientId, start.clientId],
        clock: { period: s.clock.period + 1, remainingMs: periodMs, running: false, startedAt: null },
      };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [periodMs, timed, game.periodSec]);

  const box = useMemo(() => computeBoxScore(state.events, game.starters, game.periodSec), [state.events, game.starters, game.periodSec]);

  // Opening the scorer opens period 1 (once — the ref survives StrictMode's double effect).
  const opened = useRef(false);
  useEffect(() => {
    if (opened.current) return;
    opened.current = true;
    if (!stateRef.current.events.some((e) => e.type === 'period_start' && !e.deleted)) add({ type: 'period_start' });
  }, [add]);

  return {
    events: state.events,
    box,
    clock: state.clock,
    remaining: remainingMs(state.clock),
    pendingCount: state.pending.length,
    syncing,
    online,
    lastError,
    add,
    undo,
    toggleClock,
    nextPeriod,
    flush,
    clockSecNow,
  };
}
