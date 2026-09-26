import {
  createContext,
  PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { ClerkProvider, useAuth, useClerk, useUser } from '@clerk/react';
import { CLERK_PUBLISHABLE_KEY, setClerkInstance } from '../config/clerk';
import {
  clearAuthSession,
  getCachedAuthSession,
  readAuthSession,
  saveAuthSession,
  setCachedAuthSession,
  type AuthUser,
  type UserRole,
} from '../utils/authSession';
import { apiFetch, setSessionTokenGetter, setUnauthorizedHandler } from '../services/apiClient';

// ────────────────────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────────────────────

type MeResponse = {
  success: boolean;
  user: {
    id: number;
    email: string;
    name: string;
    firstName: string | null;
    lastName: string | null;
    role: UserRole;
    clubId: number | null;
    status: string;
    clubName: string | null;
    teamIds?: string[] | null;
    avatarUrl: string | null;
    phone: string | null;
    preferredLanguage: string | null;
    createdAt: string | null;
    lastLoginAt: string | null;
  };
};

type CurrentUser = { uid: string; email: string | null } | null;

type AuthContextValue = {
  user: CurrentUser;
  session: AuthUser | null;
  initializing: boolean;
  reloadSession: () => Promise<AuthUser | null>;
  signOut: () => Promise<void>;
};

// ────────────────────────────────────────────────────────────────────────────────
// Context
// ────────────────────────────────────────────────────────────────────────────────

const AuthContext = createContext<AuthContextValue | null>(null);

// ────────────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────────────

function mapMeToAuthUser(currentUser: NonNullable<CurrentUser>, me: MeResponse['user']): AuthUser {
  return {
    id: me.id,
    uid: currentUser.uid,
    email: me.email || currentUser.email || '',
    name: me.name || `${me.firstName ?? ''} ${me.lastName ?? ''}`.trim() || currentUser.email || 'User',
    firstName: me.firstName ?? null,
    lastName: me.lastName ?? null,
    role: me.role,
    clubId: me.clubId != null ? String(me.clubId) : null,
    status: me.status as any,
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

function isProfileProvisioningError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? '');
  const normalized = message.trim().toLowerCase();

  return (
    normalized.includes('404') ||
    normalized.includes('user profile not found') ||
    normalized.includes('profile is not ready yet')
  );
}

/**
 * Fetch the Postgres user profile from the backend.
 * The apiClient automatically attaches the current session token.
 */
async function fetchMeFromBackend(currentUser: NonNullable<CurrentUser>): Promise<AuthUser> {
  // Retry a bit longer — the profile may be created shortly after sign-in
  for (let attempt = 0; attempt < 10; attempt++) {
    try {
      const data = await apiFetch<MeResponse>('/auth/me');
      if (data?.success && data.user) {
        return mapMeToAuthUser(currentUser, data.user);
      }
    } catch (err: any) {
      if (isProfileProvisioningError(err)) {
        const waitMs = Math.min(300 + attempt * 250, 1500);
        await new Promise((r) => setTimeout(r, waitMs));
        continue;
      }
      throw err;
    }

    const waitMs = Math.min(300 + attempt * 250, 1500);
    await new Promise((r) => setTimeout(r, waitMs));
  }

  throw new Error(
    'Your account profile is not ready yet. Please try again in a moment.',
  );
}

// ────────────────────────────────────────────────────────────────────────────────
// Provider
// ────────────────────────────────────────────────────────────────────────────────

function AuthBridge({ children }: PropsWithChildren) {
  const clerk = useClerk();
  const { isLoaded, isSignedIn, userId, getToken } = useAuth();
  const { user: clerkUser } = useUser();
  const [session, setSession] = useState<AuthUser | null>(getCachedAuthSession());
  const [initializing, setInitializing] = useState(true);
  const authRequestId = useRef(0);

  const currentUser: CurrentUser = useMemo(() => {
    if (!isSignedIn || !userId) {
      return null;
    }
    return {
      uid: userId,
      email: clerkUser?.primaryEmailAddress?.emailAddress ?? null,
    };
  }, [isSignedIn, userId, clerkUser]);

  useEffect(() => {
    if (isLoaded) {
      setClerkInstance(clerk);
    }
    return () => setClerkInstance(null);
  }, [clerk, isLoaded]);

  useEffect(() => {
    setSessionTokenGetter(() => getToken());
    return () => setSessionTokenGetter(null);
  }, [getToken]);

  useEffect(() => {
    if (!isLoaded) {
      return;
    }

    let mounted = true;
    const requestId = authRequestId.current + 1;
    authRequestId.current = requestId;

    (async () => {
      if (!currentUser) {
        setCachedAuthSession(null);
        await clearAuthSession();
        if (mounted && requestId === authRequestId.current) {
          setSession(null);
          setInitializing(false);
        }
        return;
      }

      try {
        const nextSession = await fetchMeFromBackend(currentUser);
        setCachedAuthSession(nextSession);
        await saveAuthSession(nextSession);
        if (mounted && requestId === authRequestId.current) {
          setSession(nextSession);
        }
      } catch (error) {
        console.error('[AuthContext] Failed to load session from backend:', error);
        // The account is still signed in — the backend was just unreachable or
        // slow (fetchMeFromBackend already retried). Fall back to the persisted
        // session for this same account so a transient hiccup (e.g. a page
        // refresh while /auth/me is briefly slow) doesn't log the user out.
        // Only clear when there's no usable session.
        const persisted = await readAuthSession();
        const fallback = persisted && persisted.uid === currentUser.uid ? persisted : null;
        if (fallback) {
          setCachedAuthSession(fallback);
        } else {
          setCachedAuthSession(null);
          await clearAuthSession();
        }
        if (mounted && requestId === authRequestId.current) {
          setSession(fallback);
        }
      } finally {
        if (mounted && requestId === authRequestId.current) {
          setInitializing(false);
        }
      }
    })();

    return () => {
      mounted = false;
    };
  }, [isLoaded, currentUser]);

  const reloadSession = useCallback(async () => {
    if (!currentUser) {
      setSession(null);
      return null;
    }

    const nextSession = await fetchMeFromBackend(currentUser);
    setCachedAuthSession(nextSession);
    setSession(nextSession);
    await saveAuthSession(nextSession);
    return nextSession;
  }, [currentUser]);

  const signOut = useCallback(async () => {
    await clerk.signOut();
    setCachedAuthSession(null);
    setSession(null);
    await clearAuthSession();
  }, [clerk]);

  // Tear the session down as soon as the backend says the credentials are no
  // longer good (token revoked, account deactivated), instead of leaving the
  // user in a shell that fails every request it makes.
  useEffect(() => {
    setUnauthorizedHandler(() => {
      void signOut();
    });
    return () => setUnauthorizedHandler(null);
  }, [signOut]);

  const value = useMemo<AuthContextValue>(
    () => ({ user: currentUser, session, initializing, reloadSession, signOut }),
    [currentUser, initializing, session, reloadSession, signOut],
  );

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function AuthProvider({ children }: PropsWithChildren) {
  return (
    <ClerkProvider publishableKey={CLERK_PUBLISHABLE_KEY}>
      <AuthBridge>{children}</AuthBridge>
    </ClerkProvider>
  );
}

// ────────────────────────────────────────────────────────────────────────────────
// Hooks & Helpers
// ────────────────────────────────────────────────────────────────────────────────

export function useSession() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useSession must be used within AuthProvider');
  }
  return context;
}

export function isRoleAllowedForAdminArea(role?: string | null) {
  return role === 'admin' || role === 'superadmin';
}
