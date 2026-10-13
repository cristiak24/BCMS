import { auditQuery, type AuditLogFilters, type AuditLogPage } from './clubAdminApi';
import { apiFetch } from './apiClient';

export type ClubRole = 'admin' | 'coach' | 'accountant' | 'staff' | 'player' | 'parent';
export type RoleCounts = Record<ClubRole, number>;

export type SuperAdminClub = {
  id: number;
  name: string;
  createdAt: string;
  stripeConnected: boolean;
  billingPricePerUser: number | null;
  internalNotes: string | null;
  accounts: { total: number; active: number; pending: number; disabled: number };
  roles: RoleCounts;
  teams: number;
  rosterPlayers: number;
  pendingInvites: number;
  /** Billable: accounts that used the app this month. */
  activeThisMonth: number;
  active30d: number;
  lastActivityAt: string | null;
  estimatedAmount: number | null;
  flags: { noAdmin: boolean; dormant: boolean; unpriced: boolean };
};

export type TrendPoint = { month: string; activeUsers: number; newAccounts: number; amount: number | null };

export type AttentionItem = {
  kind: 'pendingRequests' | 'noAdmin' | 'dormant' | 'unpriced';
  clubId?: number;
  clubName?: string;
  count?: number;
};

export type SuperAdminOverview = {
  month: string;
  trackingSince: string | null;
  totals: {
    clubs: number;
    accounts: number;
    activeAccounts: number;
    pendingAccounts: number;
    disabledAccounts: number;
    teams: number;
    rosterPlayers: number;
    pendingInvites: number;
    pendingRequests: number;
  };
  activity: { today: number; last7d: number; last30d: number; thisMonth: number; lastMonth: number };
  newAccounts: { last30d: number; prev30d: number };
  revenue: { thisMonth: number | null; lastMonth: number | null };
  roles: RoleCounts;
  trend: TrendPoint[];
  topClubs: SuperAdminClub[];
  attention: AttentionItem[];
  recentAudit: Array<{ id: number; action: string; createdAt: string | null; clubName: string | null; metadata: Record<string, unknown> | null }>;
};

export type SuperAdminUser = {
  id: number | string;
  email: string;
  name: string;
  phone?: string | null;
  role: string;
  /** Accounts: active | pending | disabled. Invites: invited. */
  status: 'active' | 'pending' | 'disabled' | 'invited';
  clubId: number | null;
  clubName: string | null;
  createdAt: string | null;
  lastLoginAt: string | null;
  activeDaysThisMonth: number;
  source: 'user' | 'invite';
};

export type ClubMember = {
  id: number;
  email: string;
  name: string;
  phone: string | null;
  role: string;
  status: 'active' | 'pending' | 'disabled';
  clubId: number | null;
  createdAt: string | null;
  lastLoginAt: string | null;
  activeDaysThisMonth: number;
};

export type ClubDetail = {
  month: string;
  club: SuperAdminClub;
  members: ClubMember[];
  invites: Array<{ id: number; email: string; role: string; createdAt: string | null; expiresAt: string | null }>;
  teams: Array<{ id: number; name: string; seasonName: string; leagueName: string; isActive: boolean; coachName: string | null; players: number }>;
  trend: TrendPoint[];
};

export type BillingRow = {
  clubId: number;
  name: string;
  pricePerUser: number | null;
  billableUsers: number;
  byRole: RoleCounts;
  amount: number | null;
  activeAccounts: number;
};

export type BillingResponse = {
  month: string;
  currentMonth: string;
  trackingSince: string | null;
  months: string[];
  clubs: BillingRow[];
  totals: { billableUsers: number; amount: number; pricedClubs: number; unpricedClubs: number };
};

export type BillingDetailUser = {
  userId: number;
  name: string;
  email: string;
  role: string | null;
  activeDays: number;
  firstSeenAt: string | null;
  lastSeenAt: string | null;
};

export type PlatformSettings = {
  inviteTtlHours: number;
  resendFromEmail: string;
  appBaseUrl: string;
  emailConfigured: boolean;
  stripeConfigured: boolean;
  activityTrackingSince: string | null;
};

export type InvitableRole = ClubRole;

export const superAdminApi = {
  getOverview() {
    return apiFetch<SuperAdminOverview & { success: boolean }>('/super-admin/overview');
  },

  listClubs() {
    return apiFetch<{ success: boolean; month: string; clubs: SuperAdminClub[] }>('/super-admin/clubs');
  },

  createClub(payload: { name: string }) {
    return apiFetch<{ success: boolean; club: SuperAdminClub }>('/super-admin/clubs', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  getClub(id: number | string) {
    return apiFetch<ClubDetail & { success: boolean }>(`/super-admin/clubs/${id}`);
  },

  updateClub(id: number, payload: { name?: string; billingPricePerUser?: number | string | null; internalNotes?: string | null }) {
    return apiFetch<{ success: boolean }>(`/super-admin/clubs/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
  },

  createInvitation(payload: { email: string; fullName: string; role: InvitableRole; clubId: number }) {
    return apiFetch<{ success: boolean; invitation: { id: number; email: string; expiresAt: string; inviteUrl: string } }>('/invitations', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  revokeInvitation(id: number | string) {
    return apiFetch<{ success: boolean }>(`/super-admin/invites/${id}/revoke`, { method: 'POST' });
  },

  listUsers() {
    return apiFetch<{ success: boolean; month: string; users: SuperAdminUser[] }>('/super-admin/users');
  },

  updateUser(id: number, payload: { name?: string; role?: ClubRole; status?: 'active' | 'disabled'; clubId?: number }) {
    return apiFetch<{ success: boolean }>(`/super-admin/users/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
  },

  getBilling(month?: string) {
    return apiFetch<BillingResponse & { success: boolean }>(`/super-admin/billing${month ? `?month=${encodeURIComponent(month)}` : ''}`);
  },

  getBillingDetail(clubId: number, month: string) {
    return apiFetch<{ success: boolean; month: string; users: BillingDetailUser[] }>(`/super-admin/billing/${clubId}?month=${encodeURIComponent(month)}`);
  },

  listAuditLogs(filters: AuditLogFilters = {}) {
    return apiFetch<AuditLogPage & { success: boolean }>(`/super-admin/audit-logs${auditQuery(filters)}`);
  },

  getSettings() {
    return apiFetch<{ success: boolean; settings: PlatformSettings }>('/super-admin/settings');
  },
};
