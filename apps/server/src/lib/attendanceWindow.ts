import { clubDateParts, clubDateTime } from './clubTime';
import { toDate } from './dateUtils';

/**
 * Attendance opens on the day of the session, Romanian time — a coach marks a
 * 19:00 training from the morning, but nobody can be "present" at a session
 * next week (audit round 2: a match on the 25th was marked on the 16th).
 */
export function attendanceOpensAt(startTime: unknown): Date | null {
    const start = toDate(startTime);
    if (!start) return null;
    const { year, month, day } = clubDateParts(start);
    return clubDateTime(year, month, day);
}

export function isAttendanceOpen(startTime: unknown, now: Date = new Date()) {
    const opensAt = attendanceOpensAt(startTime);
    // An event without a usable start can't be judged; leave it markable.
    return opensAt == null || now.getTime() >= opensAt.getTime();
}

export const ATTENDANCE_NOT_OPEN_MESSAGE = 'Prezența se poate nota din ziua evenimentului.';
