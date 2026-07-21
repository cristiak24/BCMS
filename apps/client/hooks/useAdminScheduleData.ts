import { useCallback, useEffect, useState } from 'react';
import { useFocusEffect } from '@/src/web/reactNavigationNative';
import { eventsApi, CalendarEvent } from '../services/eventsApi';
import { teamsApi, Team } from '../services/teamsApi';
import { apiFetch } from '../services/apiClient';

export type CoachUser = { id: number; name: string; role: string };

export interface ScheduleFilters {
  type: string | null;
  coachId: number | null;
  teamId: number | null;
}

/**
 * Fetches the data behind the admin schedule screen: events for the visible
 * month (server-filtered by type/coach/team), the club's teams, and the
 * coach list used by the filter modal. Centralized here so the screen
 * component only deals with rendering.
 */
export function useAdminScheduleData(currentDate: Date, filters: ScheduleFilters) {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [coaches, setCoaches] = useState<{ id: number; name: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchEvents = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const startOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
      const endOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);

      const [eventsData, teamsData] = await Promise.all([
        eventsApi.getEvents({
          start: startOfMonth.toISOString(),
          end: endOfMonth.toISOString(),
          type: filters.type || undefined,
          coachId: filters.coachId || undefined,
          teamId: filters.teamId || undefined,
        }),
        teamsApi.getTeams(),
      ]);

      setEvents(eventsData);
      setTeams(teamsData);
    } catch (err) {
      console.error('Fetch schedule error:', err);
      setError(err instanceof Error ? err.message : 'Could not load the schedule.');
    } finally {
      setLoading(false);
    }
  }, [currentDate, filters.type, filters.coachId, filters.teamId]);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  // Refresh when the screen regains focus (e.g. after editing/deleting an
  // event from its detail page).
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

  return { events, teams, coaches, loading, error, refetch: fetchEvents };
}
