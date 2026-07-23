import { apiFetch } from './apiClient';

export type ClubAdminAccountRole = 'coach' | 'player' | 'parent';

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

export const clubAdminApi = {
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
