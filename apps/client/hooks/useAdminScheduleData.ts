import { useCallback, useEffect, useState } from 'react';
import { useFocusEffect } from '@/src/web/reactNavigationNative';
import { eventsApi, CalendarEvent } from '../services/eventsApi';
import { teamsApi, Team } from '../services/teamsApi';
import { apiFetch } from '../services/apiClient';
import { loadFailureMessage } from '../utils/errorMessages';

export type CoachUser = { id: number; name: string; role: string };

export interface ScheduleFilters {
  type: string | null;
  coachId: number | null;
  teamId: number | null;
}

/**
 * Fetches the data behind the admin schedule screen: events for the visible
 * month (server-filtered by type/coach/team), the next 14 days from now (the
 * „upcoming” list — it used to come from the visible month, so on the 31st it
 * said nothing was coming up), the club's teams, and the coach list used by
 * the filter modal. Centralized here so the screen only deals with rendering.
 */

export const UPCOMING_DAYS = 14;
export function useAdminScheduleData(currentDate: Date, filters: ScheduleFilters) {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [upcoming, setUpcoming] = useState<CalendarEvent[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [coaches, setCoaches] = useState<{ id: number; name: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchEvents = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const startOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
      // The last millisecond of the month: `new Date(y, m + 1, 0)` is 00:00 on
      // the last day, which dropped that whole day (a 31 Oct match showed as
      // „nimic programat”). The server filters with startTime <= end.
      const endOfMonth = new Date(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1).getTime() - 1);

      const now = new Date();
      const scope = { type: filters.type || undefined, coachId: filters.coachId || undefined, teamId: filters.teamId || undefined };
      const [eventsData, upcomingData, teamsData] = await Promise.all([
        eventsApi.getEvents({ start: startOfMonth.toISOString(), end: endOfMonth.toISOString(), ...scope }),
        eventsApi.getEvents({ start: now.toISOString(), end: new Date(now.getTime() + UPCOMING_DAYS * 86_400_000).toISOString(), ...scope }),
        teamsApi.getTeams(),
      ]);

      setEvents(eventsData);
      setUpcoming(upcomingData);
      setTeams(teamsData);
    } catch (err) {
      console.error('Fetch schedule error:', err);
      setError(loadFailureMessage(err));
    } finally {
      setLoading(false);
    }
  }, [currentDate, filters.type, filters.coachId, filters.teamId]);

  // Runs on mount / month change AND when the app comes back to the
  // foreground (see src/web/reactNavigationNative). A separate useEffect
  // here used to fire every request twice.
  useFocusEffect(
    useCallback(() => {
      fetchEvents();
    }, [fetchEvents])
  );

  useEffect(() => {
    (async () => {
      try {
        const usersResponse = await apiFetch<CoachUser[]>('/users');
        const coachUsers = usersResponse.filter((u) => u.role === 'coach');
        setCoaches(coachUsers.map((u) => ({ id: u.id, name: u.name })));
      } catch (err) {
        console.error('Fetch filters error:', err);
      }
    })();
  }, []);

  return { events, upcoming, teams, coaches, loading, error, refetch: fetchEvents };
}
