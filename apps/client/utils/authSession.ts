import AsyncStorage from '@/src/web/asyncStorage';

export type UserRole = 'superadmin' | 'admin' | 'coach' | 'player' | 'parent' | 'staff' | 'accountant';
export type UserAccessStatus = 'active' | 'pending' | 'disabled';
export type NotificationPreferences = {
  email?: boolean;
  push?: boolean;
  sms?: boolean;
};

export type ClubMembership = {
  clubId?: string | number | null;
  role?: string | null;
};

export type AuthUser = {
  uid: string;
  id?: number;
  name: string;
  email: string;
  firstName?: string | null;
  lastName?: string | null;
  role: UserRole;
  clubId: string | null;
  teamIds?: string[] | null;
  status?: UserAccessStatus;
  clubName?: string | null;
  teamName?: string | null;
  avatarUrl?: string | null;
  photoURL?: string | null;
  phone?: string | null;
  preferredLanguage?: string | null;
  notificationPreferences?: NotificationPreferences | null;
  createdAt?: string | null;
  lastLoginAt?: string | null;
  memberships?: ClubMembership[] | null;
};

const AUTH_SESSION_KEY = 'bcms.auth.session';
let inMemorySession: AuthUser | null = null;

const CLUB_ADMIN_ROLES = new Set([
  'admin',
  'superadmin',
]);

export function normalizeRole(role?: string | null) {
  return String(role ?? '').trim().toLowerCase();
}

export function isSuperadmin(user: Pick<AuthUser, 'role'> | null | undefined) {
  return normalizeRole(user?.role) === 'superadmin';
}

export function isClubAdmin(user: Pick<AuthUser, 'role' | 'clubId' | 'memberships'> | null, activeClubId?: string | number | null) {
  if (normalizeRole(user?.role) === 'superadmin') {
    return true;
  }

  if (!user || activeClubId == null) {
    return false;
  }

  const normalizedActiveClubId = String(activeClubId);
  const normalizedGlobalRole = normalizeRole(user.role);

  if (CLUB_ADMIN_ROLES.has(normalizedGlobalRole) && String(user.clubId ?? '') === normalizedActiveClubId) {
    return true;
  }

  return user.memberships?.some((membership) => {
    const normalizedMembershipRole = normalizeRole(membership.role);
    const membershipClubId = String(membership.clubId ?? '');

    return membershipClubId === normalizedActiveClubId && CLUB_ADMIN_ROLES.has(normalizedMembershipRole);
  }) ?? false;
}

export function getHomeRouteForRole(role?: UserRole | string | null) {
  const normalized = normalizeRole(role);

  if (normalized === 'superadmin') {
    return '/super-admin';
  }

  if (normalized === 'admin' || normalized === 'accountant' || normalized === 'staff') {
    return '/admin/dashboard';
  }

  return '/myclub';
}

export async function saveAuthSession(user: AuthUser) {
  inMemorySession = user;
  await AsyncStorage.setItem(AUTH_SESSION_KEY, JSON.stringify(user));
}

export async function updateAuthSession(partial: Partial<AuthUser>) {
  const current = await readAuthSession();
  if (!current) {
    return null;
  }

  const next = { ...current, ...partial };
  await saveAuthSession(next);
  return next;
}

export async function readAuthSession(): Promise<AuthUser | null> {
  if (inMemorySession) {
    return inMemorySession;
  }

  const raw = await AsyncStorage.getItem(AUTH_SESSION_KEY);

  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as AuthUser;
  } catch {
    await AsyncStorage.removeItem(AUTH_SESSION_KEY);
    return null;
  }
}

export async function clearAuthSession() {
  inMemorySession = null;
  await AsyncStorage.removeItem(AUTH_SESSION_KEY);
}

export function setCachedAuthSession(session: AuthUser | null) {
  inMemorySession = session;
}

export function getCachedAuthSession() {
  return inMemorySession;
}
