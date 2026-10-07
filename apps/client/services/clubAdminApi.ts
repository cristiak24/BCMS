import { apiFetch } from './apiClient';

export type ClubAdminAccountRole = 'coach' | 'player' | 'parent' | 'accountant';

export type ClubAdminAccount = {
    id: number | string;
    email: string;
    name: string;
    role: string;
    status: string;
    clubId: number | null;
    clubName: string | null;
    createdAt?: string | null;
    lastLoginAt?: string | null;
    source?: 'user' | 'invite';
};

export type AuditLogEntry = {
    id: number;
    action: string;
    entityType: string;
    entityId: string | null;
    actorUserId: number | null;
    actorRole: string | null;
    actorName: string | null;
    clubId: number | null;
    metadata: unknown;
    createdAt: string;
};

export type AuditLogPage = { page: number; pageSize: number; total: number; logs: AuditLogEntry[] };

export type AuditLogFilters = { page?: number; category?: string | null };

export function auditQuery(filters: AuditLogFilters) {
    const params = new URLSearchParams();
    if (filters.page && filters.page > 1) params.set('page', String(filters.page));
    if (filters.category) params.set('category', filters.category);
    const text = params.toString();
    return text ? `?${text}` : '';
}

export const clubAdminApi = {
    listAuditLogs(filters: AuditLogFilters = {}) {
        return apiFetch<AuditLogPage>(`/club-admin/audit-logs${auditQuery(filters)}`);
    },

    listAccounts() {
        return apiFetch<{ success: boolean; users: ClubAdminAccount[] }>('/club-admin/accounts');
    },

    createInvitation(payload: { email: string; fullName: string; role: ClubAdminAccountRole }) {
        return apiFetch<{
            success: boolean;
            invitation: {
                id: number;
                email: string;
                role: ClubAdminAccountRole;
                clubId: number | null;
                clubName: string | null;
                status: string;
                expiresAt: string;
                inviteUrl: string;
            };
        }>('/club-admin/accounts/invitations', {
            method: 'POST',
            body: JSON.stringify(payload),
        });
    },

    updateUserRole(id: number, role: ClubAdminAccountRole) {
        return apiFetch<{ success: boolean; user: ClubAdminAccount }>(`/club-admin/accounts/${id}`, {
            method: 'PATCH',
            body: JSON.stringify({ role }),
        });
    },

    deactivateAccount(id: string | number) {
        return apiFetch<{ success: boolean; user?: ClubAdminAccount }>(`/club-admin/accounts/${id}/deactivate`, {
            method: 'POST',
        });
    },

    reactivateAccount(id: string | number) {
        return apiFetch<{ success: boolean; user?: ClubAdminAccount }>(`/club-admin/accounts/${id}/reactivate`, {
            method: 'POST',
        });
    },

    /** Irreversible: removes the member's profile and sign-in entirely. */
    deleteAccount(id: string | number) {
        return apiFetch<{ success: boolean }>(`/club-admin/accounts/${id}`, {
            method: 'DELETE',
        });
    },

    resendInvitation(id: string | number) {
        return apiFetch<{
            success: boolean;
            invitation: {
                id: number;
                email: string;
                role: string;
                clubId: number | null;
                clubName: string | null;
                status: string;
                expiresAt: string;
                inviteUrl: string;
            };
        }>(`/club-admin/accounts/${id}/resend`, {
            method: 'POST',
        });
    },
};
