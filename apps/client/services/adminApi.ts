import { apiFetch } from './apiClient';
import type { UserRole } from '../utils/authSession';

export type UserRequest = {
  id: number;
  name: string;
  email: string;
  status: string;
  role: UserRole;
};

export const adminApi = {
  getRequests() {
    return apiFetch<UserRequest[]>('/admin/requests');
  },

  rejectRequest(id: number) {
    return apiFetch<void>(`/admin/requests/${id}/reject`, { method: 'POST' }, 'void');
  },

  approveRequest(id: number, role: UserRole) {
    return apiFetch<void>(
      `/admin/requests/${id}/approve`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role }),
      },
      'void'
    );
  },
};
