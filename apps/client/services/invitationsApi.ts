import { apiFetch } from './apiClient';

export type Invitation = {
  id: number;
  token?: string;
  email: string;
  role: string;
  clubId: number | null;
  clubName: string | null;
  status: 'pending' | 'accepted' | 'expired' | 'revoked' | string;
  expiresAt: string;
  createdAt: string;
  inviteUrl?: string;
};

export type InvitationListResponse = {
  success: boolean;
  invitations: Invitation[];
};

export type InvitationValidationResponse = {
  success: boolean;
  invitation: {
    id: number;
    email: string;
    role: string;
    clubId: number | null;
    clubName: string | null;
    status: string;
    expiresAt: string;
    createdAt: string;
    isExpired: boolean;
    canAccept: boolean;
    message: string | null;
  };
};

export const invitationsApi = {
  list() {
    return apiFetch<InvitationListResponse>('/invitations');
  },

  create(payload: { email: string; role: 'admin' | 'coach' | 'staff' | 'player'; clubId: number }) {
    return apiFetch<{ success: boolean; invitation: Invitation }>('/invitations', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  validate(token: string) {
    return apiFetch<InvitationValidationResponse>(`/invitations/${encodeURIComponent(token)}`);
  },

  accept(token: string, payload: { email?: string; firstName?: string; lastName?: string; phone?: string | null }) {
    return apiFetch<{ success: boolean; userId: number; clubId: number | null; role: string; status: string }>(`/invitations/${encodeURIComponent(token)}/accept`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  completeRegistration(payload: { firstName: string; lastName: string; phone?: string | null; dateOfBirth?: string | null; avatarUrl?: string | null }) {
    return apiFetch<{ success: boolean; user: unknown }>('/invitations/registration/complete', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
};
