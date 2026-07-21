import { apiFetch } from './apiClient';
import type { AccessRequestItem, InviteLinkItem, InviteRole } from '../types/manageAccess';

export const manageAccessApi = {
    listRequests() {
        return apiFetch<AccessRequestItem[]>('/manage-access/requests');
    },

    approveRequest(id: number) {
        return apiFetch<void>(`/manage-access/requests/${id}/approve`, { method: 'POST' }, 'void');
    },

    denyRequest(id: number) {
        return apiFetch<void>(`/manage-access/requests/${id}/deny`, { method: 'POST' }, 'void');
    },

    getActiveInviteLink(role: InviteRole) {
        return apiFetch<InviteLinkItem | null>(`/manage-access/invite-links/active?role=${encodeURIComponent(role)}`);
    },

    generateInviteLink(role: InviteRole, refreshIntervalMinutes: number) {
        return apiFetch<InviteLinkItem>('/manage-access/invite-links/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ role, refreshIntervalMinutes }),
        });
    },
};
