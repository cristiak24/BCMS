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
import { onAuthStateChanged, signOut as firebaseSignOut, type User } from 'firebase/auth';
import { firebaseAuth } from '../config/firebase';
import {
  clearAuthSession,
  getCachedAuthSession,
  readAuthSession,
  saveAuthSession,
  setCachedAuthSession,
  type AuthUser,
  type UserRole,
} from '../utils/authSession';
import { apiFetch } from '../services/apiClient';

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

type FirebaseAuthContextValue = {
  user: User | null;
  session: AuthUser | null;
  initializing: boolean;
  reloadSession: () => Promise<AuthUser | null>;
  signOut: () => Promise<void>;
};

// ────────────────────────────────────────────────────────────────────────────────
// Context
// ────────────────────────────────────────────────────────────────────────────────

const FirebaseAuthContext = createContext<FirebaseAuthContextValue | null>(null);

// ────────────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────────────

function mapMeToAuthUser(firebaseUser: User, me: MeResponse['user']): AuthUser {
  return {
    id: me.id,
    uid: firebaseUser.uid,
    email: me.email || firebaseUser.email || '',
    name: me.name || `${me.firstName ?? ''} ${me.lastName ?? ''}`.trim() || firebaseUser.email || 'User',
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
    lastLoginAt: me.lastLoginAt ?? firebaseUser.metadata.lastSignInTime ?? null,
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
 * The apiClient automatically attaches the Firebase ID token.
 */
async function fetchMeFromBackend(firebaseUser: User): Promise<AuthUser> {
  // Retry a bit longer — the profile may be created shortly after Firebase auth
  for (let attempt = 0; attempt < 10; attempt++) {
    try {
      const data = await apiFetch<MeResponse>('/auth/me');
      if (data?.success && data.user) {
        return mapMeToAuthUser(firebaseUser, data.user);
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

export function FirebaseAuthProvider({ children }: PropsWithChildren) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<AuthUser | null>(getCachedAuthSession());
  const [initializing, setInitializing] = useState(true);
  const authRequestId = useRef(0);

  useEffect(() => {
    let mounted = true;

    const unsubscribe = onAuthStateChanged(firebaseAuth, async (nextUser) => {
      const requestId = authRequestId.current + 1;
      authRequestId.current = requestId;

      setUser(nextUser);

      if (!nextUser) {
        setCachedAuthSession(null);
        await clearAuthSession();
        if (mounted && requestId === authRequestId.current) {
          setSession(null);
          setInitializing(false);
        }
        return;
      }

      try {
        const nextSession = await fetchMeFromBackend(nextUser);
        setCachedAuthSession(nextSession);
        await saveAuthSession(nextSession);
        if (mounted && requestId === authRequestId.current) {
          setSession(nextSession);
        }
      } catch (error) {
        console.error('[AuthContext] Failed to load session from backend:', error);
        // The Firebase user is still authenticated — the backend was just unreachable or
        // slow (fetchMeFromBackend already retried). Fall back to the persisted session for
        // this same account so a transient hiccup (e.g. a page refresh while /auth/me is
        // briefly slow) doesn't log the user out. Only clear when there's no usable session.
        const persisted = await readAuthSession();
        const fallback = persisted && persisted.uid === nextUser.uid ? persisted : null;
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
    });

    return () => {
      mounted = false;
      unsubscribe();
    };
  }, []);

  const reloadSession = useCallback(async () => {
    if (!firebaseAuth.currentUser) {
      setSession(null);
      return null;
    }

    const nextSession = await fetchMeFromBackend(firebaseAuth.currentUser);
    setCachedAuthSession(nextSession);
    setSession(nextSession);
    await saveAuthSession(nextSession);
    return nextSession;
  }, []);

  const signOut = useCallback(async () => {
    await firebaseSignOut(firebaseAuth);
    setCachedAuthSession(null);
    setSession(null);
    await clearAuthSession();
  }, []);

  const value = useMemo<FirebaseAuthContextValue>(
    () => ({ user, session, initializing, reloadSession, signOut }),
    [initializing, session, user, reloadSession, signOut],
  );

  return (
    <FirebaseAuthContext.Provider value={value}>
      {children}
    </FirebaseAuthContext.Provider>
  );
}

// ────────────────────────────────────────────────────────────────────────────────
// Hooks & Helpers
// ────────────────────────────────────────────────────────────────────────────────

export function useFirebaseAuth() {
  const context = useContext(FirebaseAuthContext);
  if (!context) {
    throw new Error('useFirebaseAuth must be used within FirebaseAuthProvider');
  }
  return context;
}

export function isRoleAllowedForAdminArea(role?: string | null) {
  return role === 'admin' || role === 'superadmin';
}
