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
    return attendanceSummaryFromCounts(rows.map((row) => ({ status: row.status, count: 1 })));
}

/**
 * The same summary from rows already counted per status (SQL `GROUP BY
 * status`), so a screen does not have to load every attendance row.
 */
export function attendanceSummaryFromCounts(buckets: Array<{ status: string | null; count: number }>) {
    let attended = 0;
    let counted = 0;
    for (const bucket of buckets) {
        if (!isCountedStatus(bucket.status)) continue;
        counted += bucket.count;
        if (isAttendedStatus(bucket.status)) attended += bucket.count;
    }
    return {
        attended,
        counted,
        /** Percent, one decimal; null when nothing was counted yet. */
        rate: counted ? Math.round((attended / counted) * 1000) / 10 : null,
    };
}
