/**
 * Decides which month the schedule should open on.
 *
 * The screen used to do `visibleEvents.find(isUpcoming) ?? visibleEvents[0]` against an
 * ascending list. With no upcoming event — off-season, or a club that has not scheduled
 * anything yet — that fallback selected the OLDEST event in club history and the
 * calendar opened in 2023. Landing backwards in time is never useful, so when there is
 * nothing ahead the answer is simply "this month".
 *
 * Pure and dependency-free so the rule is unit-testable and cannot regress.
 */

export type LandingEvent = {
    startTime?: unknown;
};

/**
 * Callers pass the already-visible list (cancelled events filtered out upstream, the
 * same way `isUpcoming` excluded them), so this only reasons about time.
 *
 * Boundary: an event whose start is exactly `now` counts as upcoming — inclusive,
 * matching the existing `getEventTimestamp(event) >= Date.now()` in `isUpcoming`.
 */
export function findNextUpcomingEvent<T extends LandingEvent>(
    events: readonly T[] | null | undefined,
    now: Date = new Date(),
): T | null {
    if (!Array.isArray(events) || events.length === 0) {
        return null;
    }

    const reference = now.getTime();
    if (!Number.isFinite(reference)) {
        return null;
    }

    let best: T | null = null;
    let bestTime = Number.POSITIVE_INFINITY;

    // Scans rather than taking [0]: the caller is not required to have sorted, and a
    // sorted-input assumption is exactly what made the original bug invisible.
    for (const event of events) {
        const time = new Date(String(event?.startTime ?? '')).getTime();
        if (!Number.isFinite(time)) {
            continue;
        }
        if (time >= reference && time < bestTime) {
            best = event;
            bestTime = time;
        }
    }

    return best;
}

function firstOfMonth(date: Date) {
    return new Date(date.getFullYear(), date.getMonth(), 1);
}

/**
 * The month to open on: the next upcoming event's month, otherwise the current month.
 * Never a past month.
 */
export function resolveLandingMonth(
    events: readonly LandingEvent[] | null | undefined,
    now: Date = new Date(),
): Date {
    const reference = Number.isFinite(now.getTime()) ? now : new Date();
    const upcoming = findNextUpcomingEvent(events, reference);

    if (!upcoming) {
        return firstOfMonth(reference);
    }

    const upcomingDate = new Date(String(upcoming.startTime ?? ''));
    return Number.isFinite(upcomingDate.getTime()) ? firstOfMonth(upcomingDate) : firstOfMonth(reference);
}
