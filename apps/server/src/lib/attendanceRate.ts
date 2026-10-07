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
