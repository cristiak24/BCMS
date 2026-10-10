import { apiFetch } from './apiClient';
import type { AccessRequestItem, InviteCodeItem, InviteLinkItem, InviteRole } from '../types/manageAccess';

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

    getActiveInviteLink(role: InviteRole, teamId: number | null = null) {
        const team = teamId != null ? `&teamId=${teamId}` : '';
        return apiFetch<InviteLinkItem | null>(`/manage-access/invite-links/active?role=${encodeURIComponent(role)}${team}`);
    },

    generateInviteLink(role: InviteRole, refreshIntervalMinutes: number, teamId: number | null = null) {
        return apiFetch<InviteLinkItem>('/manage-access/invite-links/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ role, refreshIntervalMinutes, ...(teamId != null ? { teamId } : {}) }),
        });
    },

    listInviteCodes() {
        return apiFetch<InviteCodeItem[]>('/manage-access/invite-codes');
    },

    createInviteCode(payload: { role: InviteRole; teamId?: number | null; expiresInHours: number; maxUses: number }) {
        return apiFetch<InviteCodeItem>('/manage-access/invite-codes', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });
    },

    revokeInviteCode(id: number) {
        return apiFetch<InviteCodeItem>(`/manage-access/invite-codes/${id}/revoke`, { method: 'POST' });
    },
};
