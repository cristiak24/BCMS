import { apiFetch } from './apiClient';

export type SuperAdminDashboardResponse = {
  success: boolean;
  stats: {
    clubs: number;
    users: number;
    admins: number;
    coaches: number;
    staff: number;
    players: number;
    pendingInvites: number;
    inactiveUsers: number;
  };
  clubs: Array<{
    id: number;
    name: string;
    normalizedName: string | null;
    createdBy: string | null;
    createdAt: string;
    updatedAt: string;
    userCount: number;
    adminCount: number;
    coachCount: number;
    staffCount: number;
    playerCount: number;
  }>;
  recentAuditLogs: Array<Record<string, unknown> & { createdAt: string; action: string; clubName: string | null }>;
};

export type SuperAdminClub = {
  id: number;
  name: string;
  normalizedName: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
  status: 'active';
  userCount: number;
  adminCount: number;
  coachCount: number;
  staffCount: number;
  playerCount: number;
  adminsCount: number;
  usersCount: number;
  pendingInviteCount: number;
};

type ClubsListener = (clubs: SuperAdminClub[]) => void;

let cachedClubs: SuperAdminClub[] | null = null;
const clubsListeners = new Set<ClubsListener>();

function emitClubs(nextClubs: SuperAdminClub[]) {
  cachedClubs = nextClubs;
  clubsListeners.forEach((listener) => listener(nextClubs));
}

function normalizeClub(club: SuperAdminClub): SuperAdminClub {
  return {
    ...club,
    status: club.status ?? 'active',
    adminsCount: club.adminsCount ?? club.adminCount ?? 0,
    usersCount: club.usersCount ?? club.userCount ?? 0,
  };
}

function cloneClubs(clubs: SuperAdminClub[]) {
  return clubs.map((club) => normalizeClub({ ...club }));
}

export function getCachedSuperAdminClubs() {
  return cachedClubs ? cloneClubs(cachedClubs) : null;
}

export function setCachedSuperAdminClubs(clubs: SuperAdminClub[]) {
  emitClubs(cloneClubs(clubs));
}

export function upsertCachedSuperAdminClub(club: SuperAdminClub) {
  const normalized = normalizeClub(club);
  const next = cachedClubs ? cloneClubs(cachedClubs) : [];
  const index = next.findIndex((item) => item.id === normalized.id);

  if (index >= 0) {
    next[index] = normalized;
  } else {
    next.unshift(normalized);
  }

  emitClubs(next);
}

export function subscribeToClubs(listener: ClubsListener) {
  clubsListeners.add(listener);
  if (cachedClubs) {
    listener(cloneClubs(cachedClubs));
  }

  return () => {
    clubsListeners.delete(listener);
  };
}

export type SuperAdminUser = {
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

export const superAdminApi = {
  getDashboard() {
    return apiFetch<SuperAdminDashboardResponse>('/super-admin/dashboard');
  },

  getClubs() {
    return apiFetch<{ success: boolean; clubs: SuperAdminClub[] }>('/super-admin/clubs').then((response) => {
      const clubs = cloneClubs(response.clubs);
      emitClubs(clubs);
      return { ...response, clubs };
    });
  },

  refreshClubs() {
    return apiFetch<{ success: boolean; clubs: SuperAdminClub[] }>('/super-admin/clubs').then((response) => {
      const clubs = cloneClubs(response.clubs);
      emitClubs(clubs);
      return { ...response, clubs };
    });
  },

  createClub(payload: { name: string }) {
    return apiFetch<{ success: boolean; club: SuperAdminClub }>('/super-admin/clubs', {
      method: 'POST',
      body: JSON.stringify(payload),
    }).then((response) => {
      upsertCachedSuperAdminClub(response.club);
      return response;
    });
  },

  createInvitation(payload: { email: string; fullName?: string; role: 'admin' | 'coach' | 'staff' | 'player'; clubId: number }) {
    return apiFetch<{ success: boolean; invitation: { id: number; email: string; role: string; clubId: number | null; clubName: string | null; status: string; expiresAt: string; inviteUrl: string } }>('/invitations', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  listUsers() {
    return apiFetch<{ success: boolean; users: SuperAdminUser[] }>('/super-admin/users');
  },

  updateUser(id: string | number, payload: Partial<Pick<SuperAdminUser, 'name' | 'role' | 'status' | 'clubId'>>) {
    return apiFetch<{ success: boolean; user: SuperAdminUser }>(`/super-admin/users/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
  },

  deactivateUser(id: string | number) {
    return apiFetch<{ success: boolean; user: SuperAdminUser }>(`/super-admin/users/${id}/deactivate`, {
      method: 'POST',
    });
  },

  listAuditLogs() {
    return apiFetch<{ success: boolean; logs: Array<Record<string, unknown>> }>('/super-admin/audit-logs');
  },

  listRoles() {
    return apiFetch<{ success: boolean; roles: Array<{ code: string; label: string; scope: string; permissions: string[] }> }>('/super-admin/roles');
  },

  getSettings() {
    return apiFetch<{ success: boolean; settings: Record<string, unknown> }>('/super-admin/settings');
  },
};
