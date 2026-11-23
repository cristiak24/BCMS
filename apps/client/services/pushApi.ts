import { apiClient } from './apiClient';

/** Web push (Val 3B) — server routes/push.ts. */
export type PushKind = 'event_new' | 'event_changed' | 'rsvp_reminder' | 'rsvp_declined' | 'payment_overdue';

export interface PushDevice {
    id: number;
    label: string | null;
    endpoint: string;
    createdAt: string | null;
}

export interface PushMe {
    enabled: boolean;
    /** What this role can receive; empty → no card. */
    kinds: PushKind[];
    preferences: Partial<Record<PushKind, boolean>>;
    devices: PushDevice[];
}

export const pushApi = {
    async config() {
        return (await apiClient.get<{ enabled: boolean; publicKey: string | null }>('/push/config')).data;
    },
    async me() {
        return (await apiClient.get<PushMe>('/push/me')).data;
    },
    async subscribe(body: { endpoint: string; keys: { p256dh: string; auth: string }; label: string }) {
        return (await apiClient.put<{ id: number }>('/push/subscription', body)).data;
    },
    async unsubscribe(endpoint: string) {
        return (await apiClient.post<{ ok: boolean }>('/push/unsubscribe', { endpoint })).data;
    },
    async removeDevice(id: number) {
        await apiClient.delete(`/push/devices/${id}`);
    },
    async setPreferences(changes: Partial<Record<PushKind, boolean>>) {
        return (await apiClient.put<{ preferences: Partial<Record<PushKind, boolean>> }>('/push/preferences', changes)).data;
    },
    async test(endpoint: string) {
        return (await apiClient.post<{ ok: boolean }>('/push/test', { endpoint })).data;
    },
};
