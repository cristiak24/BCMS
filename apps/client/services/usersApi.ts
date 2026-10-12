import { apiFetch } from './apiClient';
import type { UserRole } from '../utils/authSession';

export type User = {
  id: number;
  name: string;
  email: string;
  role: UserRole;
};

export type AccountProfile = User & {
  status: string;
  phone: string | null;
  createdAt: string;
  lastLoginAt: string | null;
  /** Coach: the teams they lead. Player: the teams they play in. */
  teams: { id: number; name: string }[];
  /** Parent: linked children, each with the other parents on that child. */
  family: {
    id: number;
    name: string;
    birthYear: number | null;
    number: number | null;
    teams: { id: number; name: string }[];
    parents: { id: number; name: string; email: string }[];
  }[];
};

export const usersApi = {
  getUsers() {
    return apiFetch<User[]>('/users');
  },

  getUserById(id: string | number) {
    return apiFetch<AccountProfile>(`/users/${id}`);
  },

  updateUser(id: string | number, payload: Partial<Pick<User, 'name' | 'role'>>) {
    return apiFetch<User>(`/users/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  },
};
