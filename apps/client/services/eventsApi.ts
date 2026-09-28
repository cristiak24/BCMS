import { apiClient } from './apiClient';

export interface CalendarEvent {
    id: number;
    type: 'training' | 'match' | 'camp' | 'admin' | 'medical';
    title: string;
    description: string | null;
    location: string | null;
    startTime: string;
    endTime: string;
    teamId: number | null;
    coachId: number | null;
    amount: number | null;
    status: string;
    teamName?: string;
    coachName?: string;
    coachNote?: string | null;
}

export interface EventAttendance {
    playerId: number;
    firstName: string;
    lastName: string;
    number: number | null;
    status: string | null;
    note?: string | null;
}

export const eventsApi = {
    async getEvents(filters: { start?: string, end?: string, type?: string, coachId?: number, teamId?: number } = {}) {
        const response = await apiClient.get<CalendarEvent[]>('/events', { params: filters });
        return response.data;
    },

    async getEventById(id: number) {
        const response = await apiClient.get<CalendarEvent>(`/events/${id}`);
        return response.data;
    },

    async createEvent(data: Partial<CalendarEvent>) {
        const response = await apiClient.post<CalendarEvent>('/events', data);
        return response.data;
    },

    async updateEvent(id: number, data: Partial<CalendarEvent>) {
        const response = await apiClient.put<CalendarEvent>(`/events/${id}`, data);
        return response.data;
    },

    async deleteEvent(id: number) {
        await apiClient.delete(`/events/${id}`);
    },

    /**
     * The signed-in player's OWN attendance rows for the given events, in one
     * request (GET /players/me/attendance). Max 100 ids per call.
     */
    async getMyAttendance(eventIds: number[]) {
        if (!eventIds.length) return [] as (EventAttendance & { eventId: number })[];
        const response = await apiClient.get<(EventAttendance & { eventId: number })[]>('/players/me/attendance', {
            params: { eventIds: eventIds.join(',') },
        });
        return response.data;
    },

    /** The signed-in player's most recent marked sessions (own rows + events), newest first. */
    async getMyRecentAttendance(limit = 40) {
        const response = await apiClient.get<(EventAttendance & { eventId: number; event: CalendarEvent })[]>('/players/me/attendance', {
            params: { limit },
        });
        return response.data;
    },

    async getEventAttendance(id: number) {
        const response = await apiClient.get<EventAttendance[]>(`/events/${id}/attendance`);
        return response.data;
    },

    async updateEventAttendance(id: number, playerAttendances: { playerId: number, status: string, note?: string | null }[]) {
        const response = await apiClient.post(`/events/${id}/attendance`, { playerAttendances });
        return response.data;
    },

    async syncFRBMatches(): Promise<{ success: boolean; syncedCount: number }> {
        const response = await apiClient.post<{ success: boolean; syncedCount: number }>('/events/sync-frb');
        return response.data;
    }
};
