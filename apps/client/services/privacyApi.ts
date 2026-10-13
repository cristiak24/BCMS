import { apiClient, apiFetch } from './apiClient';

export type PrivacyStatus = {
    version: string;
    accepted: boolean;
    erasureRequestedAt: string | null;
};

/** GDPR self-service — see apps/server/src/routes/privacy.ts. */
export const privacyApi = {
    async status() {
        return (await apiClient.get<PrivacyStatus>('/privacy/status')).data;
    },
    async accept(version: string) {
        return (await apiClient.post<{ version: string; accepted: boolean }>('/privacy/accept', { version })).data;
    },
    async requestErasure() {
        return (await apiClient.post<{ requested: boolean; alreadyOpen: boolean; requestedAt: string }>('/privacy/erasure-request')).data;
    },
    /** The caller's data as a JSON file the browser saves. */
    async downloadExport() {
        const blob = await apiFetch<Blob>('/privacy/export', undefined, 'blob');
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `bcms-datele-mele-${new Date().toISOString().slice(0, 10)}.json`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
    },
};
