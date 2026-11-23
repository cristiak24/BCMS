import { apiClient } from './apiClient';

/** „Vin / Nu vin / Poate” — server lib/eventResponses.ts. */
export type ResponseStatus = 'going' | 'not_going' | 'maybe';

/** The caller's own answer (a parent: for the selected child). */
export interface MyEventResponse {
    eventId: number;
    status: ResponseStatus;
    reason: string | null;
    respondedByName: string | null;
    updatedAt: string | null;
}

export interface ResponseCounts {
    going: number;
    notGoing: number;
    maybe: number;
    none: number;
}

export interface StaffResponseRow {
    playerId: number;
    firstName: string;
    lastName: string;
    number: number | null;
    status: ResponseStatus | null;
    reason: string | null;
    respondedByName: string | null;
    respondedByRelation: 'player' | 'parent' | null;
    updatedAt: string | null;
}

/** GET /events/:id/responses — the team's coach and the admin only. */
export interface EventResponsesSummary {
    eventId: number;
    enabled: boolean;
    open: boolean;
    closesAt: string | null;
    canRemind: boolean;
    lastReminderAt: string | null;
    counts: ResponseCounts;
    players: StaffResponseRow[];
}

export const eventResponsesApi = {
    async respond(eventId: number, status: ResponseStatus, reason: string | null) {
        const response = await apiClient.put<MyEventResponse>(`/events/${eventId}/response`, { status, reason });
        return response.data;
    },

    async mine(range: { from: string; to: string }) {
        const response = await apiClient.get<MyEventResponse[]>('/events/responses/mine', { params: range });
        return response.data;
    },

    async forEvent(eventId: number) {
        const response = await apiClient.get<EventResponsesSummary>(`/events/${eventId}/responses`);
        return response.data;
    },

    async remind(eventId: number) {
        const response = await apiClient.post<{ players: number; notifications: number }>(`/events/${eventId}/responses/remind`);
        return response.data;
    },
};
