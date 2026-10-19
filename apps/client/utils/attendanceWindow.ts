import { toCalendarDay } from './dates';

/**
 * Mirror of the server rule (lib/attendanceWindow.ts): a session can be
 * marked from its own day on, Romanian calendar. The server refuses earlier
 * marks with 409; the screens don't offer them.
 */
export function isAttendanceOpen(startTime: string | null | undefined, now: Date = new Date()) {
  const day = toCalendarDay(startTime);
  return !day || day <= toCalendarDay(now);
}
