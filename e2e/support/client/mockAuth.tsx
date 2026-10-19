/**
 * E2E-only replacement for apps/client/context/AuthContext.tsx (swapped in by
 * e2e/support/client/vite.config.mts — never part of the production build).
 *
 * No Clerk: the signed-in account is the email in localStorage
 * `bcms.e2e.as` (or `?as=<email>` once), and every API call carries the token
 * `test:<email>`, which the E2E API (e2e/support/server/fakeClerk.ts)
 * accepts as that verified identity. /auth/me and everything after it is the
 * real app.
 */
import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { apiFetch, setActiveChildId, setSessionTokenGetter, setUnauthorizedHandler } from '../../../apps/client/services/apiClient';
import {
  clearAuthSession,
  saveAuthSession,
  setCachedAuthSession,
  type AuthUser,
  type UserRole,
} from '../../../apps/client/utils/authSession';

/** Marker the isolation test looks for in builds (must never ship). */
export const E2E_AUTH_MOCK_MARKER = 'bcms-e2e-auth-mock';

const AS_KEY = 'bcms.e2e.as';

function signedInEmail(): string | null {
  const fromUrl = new URLSearchParams(window.location.search).get('as');
  if (fromUrl) window.localStorage.setItem(AS_KEY, fromUrl.trim().toLowerCase());
  return window.localStorage.getItem(AS_KEY);
}

const email = signedInEmail();
// Registered before any screen mounts, so the first request already has a token.
setSessionTokenGetter(async () => (email ? `test:${email}` : null));

type CurrentUser = { uid: string; email: string | null } | null;
type AuthContextValue = {
  user: CurrentUser;
  session: AuthUser | null;
  initializing: boolean;
  reloadSession: () => Promise<AuthUser | null>;
  signOut: () => Promise<void>;
};

type Me = {
  id: number; email: string; name: string; firstName: string | null; lastName: string | null;
  role: UserRole; clubId: number | null; status: string; clubName: string | null; teamIds?: string[] | null;
  avatarUrl: string | null; phone: string | null; preferredLanguage: string | null;
  createdAt: string | null; lastLoginAt: string | null;
};

const AuthContext = createContext<AuthContextValue | null>(null);
const currentUser: CurrentUser = email ? { uid: `test_${email}`, email } : null;

async function loadSession(): Promise<AuthUser | null> {
  if (!currentUser) return null;
  const data = await apiFetch<{ success: boolean; user: Me }>('/auth/me');
  const me = data.user;
  return {
    id: me.id,
    uid: currentUser.uid,
    email: me.email,
    name: me.name,
    firstName: me.firstName ?? null,
    lastName: me.lastName ?? null,
    role: me.role,
    clubId: me.clubId != null ? String(me.clubId) : null,
    status: me.status as AuthUser['status'],
    clubName: me.clubName ?? null,
    teamIds: me.teamIds ?? null,
    teamName: null,
    avatarUrl: me.avatarUrl ?? null,
    photoURL: me.avatarUrl ?? null,
    phone: me.phone ?? null,
    preferredLanguage: me.preferredLanguage ?? null,
    createdAt: me.createdAt ?? null,
    lastLoginAt: me.lastLoginAt ?? null,
  };
}

export function AuthProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<AuthUser | null>(null);
  const [initializing, setInitializing] = useState(true);

  const reloadSession = useCallback(async () => {
    const next = await loadSession();
    setCachedAuthSession(next);
    if (next) await saveAuthSession(next);
    setSession(next);
    return next;
  }, []);

  const signOut = useCallback(async () => {
    window.localStorage.removeItem(AS_KEY);
    setActiveChildId(null);
    setCachedAuthSession(null);
    await clearAuthSession();
    setSession(null);
  }, []);

  useEffect(() => {
    reloadSession()
      .catch((error) => console.error('[e2e auth] /auth/me failed', error))
      .finally(() => setInitializing(false));
  }, [reloadSession]);

  useEffect(() => {
    setUnauthorizedHandler(() => { void signOut(); });
    return () => setUnauthorizedHandler(null);
  }, [signOut]);

  const value = useMemo<AuthContextValue>(
    () => ({ user: currentUser, session, initializing, reloadSession, signOut }),
    [session, initializing, reloadSession, signOut],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useSession() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useSession must be used within AuthProvider');
  return context;
}

export function isRoleAllowedForAdminArea(role?: string | null) {
  return role === 'admin' || role === 'superadmin';
}

if (typeof window !== 'undefined') {
  (window as unknown as Record<string, string>).__bcmsE2E = E2E_AUTH_MOCK_MARKER;
}
