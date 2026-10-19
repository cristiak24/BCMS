import { parseApiDate } from './dates';
import { isAttendanceOpen } from './attendanceWindow';

type Session = { startTime: string };

function timeOf(session: Session) {
  const time = parseApiDate(session.startTime).getTime();
  return Number.isNaN(time) ? 0 : time;
}

/**
 * The coach's session picker in two groups: what is still ahead (soonest
 * first) and what has started (latest first). One list sorted by "closest to
 * now" read 16 Oct, 25 Oct, 8 Oct — neither chronological nor grouped.
 */
export function splitSessions<T extends Session>(sessions: T[], now: number = Date.now()) {
  const upcoming = sessions.filter((s) => timeOf(s) >= now).sort((a, b) => timeOf(a) - timeOf(b));
  const past = sessions.filter((s) => timeOf(s) < now).sort((a, b) => timeOf(b) - timeOf(a));
  return { upcoming, past };
}

/**
 * The session to open first: one later today (markable already), else the
 * latest one that has started, else the next one ahead.
 */
export function defaultSession<T extends Session>(groups: { upcoming: T[]; past: T[] }, now: Date = new Date()): T | null {
  const today = groups.upcoming.find((s) => isAttendanceOpen(s.startTime, now));
  return today ?? groups.past[0] ?? groups.upcoming[0] ?? null;
}
