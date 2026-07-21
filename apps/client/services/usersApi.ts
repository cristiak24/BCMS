import { apiFetch } from './apiClient';
import type { UserRole } from '../utils/authSession';

export type User = {
  id: number;
  name: string;
  email: string;
  role: UserRole;
};

export const usersApi = {
  getUsers() {
    return apiFetch<User[]>('/users');
  },

  getUserById(id: string | number) {
    return apiFetch<User>(`/users/${id}`);
  },

  updateUser(id: string | number, payload: Partial<Pick<User, 'name' | 'role'>>) {
    return apiFetch<User>(`/users/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  },
};
