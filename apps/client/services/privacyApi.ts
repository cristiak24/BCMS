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

/** A GDPR request as the club admin / super admin sees it (GET /privacy/requests). */
export type PrivacyRequestRow = {
    id: number;
    type: string;
    status: 'open' | 'resolved' | string;
    createdAt: string;
    /** 30 days after the request (lib/privacyRequests.ts on the server). */
    dueAt: string | null;
    daysLeft: number | null;
    overdue: boolean;
    closedAt: string | null;
    resolutionNote: string | null;
    closedBy: { id: number; name: string | null } | null;
    requester: { id: number; name: string | null; email: string | null; role: string | null; status: string | null };
    club: { id: number; name: string | null } | null;
};

export const privacyRequestsApi = {
    async list(status: 'open' | 'closed' | 'all' = 'open') {
        return (await apiClient.get<PrivacyRequestRow[]>(`/privacy/requests?status=${status}`)).data;
    },
    async resolve(id: number, note: string) {
        return (await apiClient.post<{ id: number; status: string; closedAt: string; resolutionNote: string | null }>(`/privacy/requests/${id}/resolve`, { note })).data;
    },
};
