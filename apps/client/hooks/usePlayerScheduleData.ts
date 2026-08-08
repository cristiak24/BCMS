import { useCallback, useEffect, useState } from 'react';
import { useFocusEffect } from '@/src/web/reactNavigationNative';
import { eventsApi, CalendarEvent } from '../services/eventsApi';
import { getCoachScopedEvents } from '../components/coach/coachUtils';
import { AuthUser } from '../utils/authSession';

/**
 * Fetches the data behind the player schedule screen: events for the visible
 * month only, requested per team the session belongs to.
 *
 * The screen previously called `eventsApi.getEvents()` with no arguments, which
 * pulled every event the club had ever recorded and then hid the ones that were
 * not the player's in the browser. That grew without bound as a club aged, and
 * it put other teams' titles, locations, times and coach ids in a response the
 * player could read straight off the wire. Asking the server for one month of
 * one team fixes both at once.
 */

/** Requesting more than this many teams in parallel is a signal the API needs a multi-team filter. */
export const MAX_TEAM_REQUESTS = 3;

function getSessionTeamIds(user: AuthUser | null) {
    return Array.from(new Set(
        (user?.teamIds ?? [])
            .map((teamId) => Number(teamId))
            .filter((teamId) => Number.isFinite(teamId))
    ));
}

function dedupeById(events: CalendarEvent[]) {
    // One event can come back from more than one per-team request when a player
    // belongs to several teams; keep the first occurrence.
    const seen = new Set<number>();
    return events.filter((event) => {
        if (seen.has(event.id)) {
            return false;
        }
        seen.add(event.id);
        return true;
    });
}

export function usePlayerScheduleData(currentDate: Date, session: AuthUser | null, isCoach: boolean) {
    const [events, setEvents] = useState<CalendarEvent[]>([]);
    const [loading, setLoading] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();

    const fetchEvents = useCallback(async (showSpinner = false) => {
        if (showSpinner) {
            setRefreshing(true);
        } else {
            setLoading(true);
        }
        setError(null);

        try {
            const startOfMonth = new Date(year, month, 1);
            const endOfMonth = new Date(year, month + 1, 0);
            const range = {
                start: startOfMonth.toISOString(),
                end: endOfMonth.toISOString(),
            };

            const teamIds = getSessionTeamIds(session);

            // A coach's scope is resolved from the session by getCoachScopedEvents
            // below rather than from teamIds, so their request stays month-scoped
            // without a teamId. Players ask per team.
            let fetched: CalendarEvent[];
            if (isCoach || teamIds.length === 0) {
                fetched = await eventsApi.getEvents(range);
            } else {
                const requestedTeamIds = teamIds.slice(0, MAX_TEAM_REQUESTS);
                const batches = await Promise.all(
                    requestedTeamIds.map((teamId) => eventsApi.getEvents({ ...range, teamId }))
                );
                fetched = dedupeById(batches.flat());
            }

            setEvents(isCoach ? getCoachScopedEvents(fetched, session) : fetched);
        } catch (err) {
            console.error('Fetch player schedule error:', err);
            setError(err instanceof Error ? err.message : 'Programul nu a putut fi încărcat.');
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
        // Depend on the resolved year/month rather than the Date instance, so a new
        // Date object for the same month does not trigger another request.
    }, [year, month, isCoach, session]);

    useEffect(() => {
        fetchEvents();
    }, [fetchEvents]);

    useFocusEffect(
        useCallback(() => {
            fetchEvents();
        }, [fetchEvents])
    );

    return { events, loading, refreshing, error, refetch: fetchEvents };
}
