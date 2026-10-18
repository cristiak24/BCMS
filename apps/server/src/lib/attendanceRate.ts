/**
 * One attendance rate for every screen (audit BUG-031): attended ÷ (attended
 * + absent). "Late" counts as attended; medical/excused absences are left out
 * of the rate entirely — the same definition the admin schedule's attendance
 * tab already used. The coach's and the player's screens used to disagree
 * (one counted excused as present, the other as absent).
 */

function normalize(status?: string | null) {
    return String(status ?? '').trim().toLowerCase();
}

export function isAttendedStatus(status?: string | null) {
    const value = normalize(status);
    return value === 'present' || value === 'prezent' || value === 'late';
}

/** Statuses that enter the rate's denominator. */
export function isCountedStatus(status?: string | null) {
    return isAttendedStatus(status) || normalize(status) === 'absent';
}

export function attendanceSummary(rows: Array<{ status: string | null }>) {
    const counted = rows.filter((row) => isCountedStatus(row.status));
    const attended = counted.filter((row) => isAttendedStatus(row.status)).length;
    return {
        attended,
        counted: counted.length,
        /** Percent, one decimal; null when nothing was counted yet. */
        rate: counted.length ? Math.round((attended / counted.length) * 1000) / 10 : null,
    };
}

// ── One period for every screen (audit P1-9) ────────────────────────────────
// Dashboard, Lot, the team page and the coach's home each used their own
// window (calendar month, all time, 30 days) and their own aggregate (pooled
// sessions vs. the average of player rates, with players who have no data
// counted as 0%), so the same club showed 71%, 60% and 40%. Every club, team
// and player rate is now `attendanceRate` over the last 30 days, pooled over
// marked sessions, with the period sent along so the screens can say it.

export const ATTENDANCE_PERIOD_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

export type AttendancePeriod = { from: Date; to: Date };

/** The last 30 days up to `now`; `back = 1` is the 30 days before those. */
export function attendancePeriod(now = new Date(), back = 0): AttendancePeriod {
    const to = new Date(now.getTime() - back * ATTENDANCE_PERIOD_DAYS * DAY_MS);
    return { from: new Date(to.getTime() - ATTENDANCE_PERIOD_DAYS * DAY_MS), to };
}

function rowTime(value: unknown) {
    if (value instanceof Date) return value.getTime();
    if (typeof value !== 'string' || !value) return NaN;
    // Rows are dated by their session (timestamp text, UTC).
    const naive = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(value) ? `${value.replace(' ', 'T')}Z` : value;
    return new Date(naive).getTime();
}

/** Within (from, to]: consecutive periods never count a session twice. */
export function inAttendancePeriod(date: unknown, period: AttendancePeriod) {
    const time = rowTime(date);
    return Number.isFinite(time) && time > period.from.getTime() && time <= period.to.getTime();
}

/**
 * The rate: attended ÷ (attended + absent) over the period's marked sessions,
 * a whole percent; null when nothing was marked in the period.
 */
export function attendanceRate(rows: Array<{ status: string | null; date?: unknown }>, period: AttendancePeriod) {
    const summary = attendanceSummary(rows.filter((row) => inAttendancePeriod(row.date, period)));
    return {
        attended: summary.attended,
        counted: summary.counted,
        rate: summary.counted ? Math.round((summary.attended / summary.counted) * 100) : null,
    };
}

/** What the API sends next to a rate, so every screen can name its period. */
export function attendancePeriodInfo(period: AttendancePeriod) {
    return { days: ATTENDANCE_PERIOD_DAYS, from: period.from.toISOString(), to: period.to.toISOString() };
}
