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
  readAuthSession,
  readAuthSessionSync,
  saveAuthSession,
  setCachedAuthSession,
  type AuthUser,
  type UserRole,
} from '../utils/authSession';
import { ApiError, apiFetch, setActiveChildId, setSessionTokenGetter, setUnauthorizedHandler } from '../services/apiClient';

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

/** The Clerk session exists client-side but can no longer mint a valid token. */
class DeadSessionError extends Error {
  constructor() {
    super('Clerk session is no longer valid.');
    this.name = 'DeadSessionError';
  }
}

// ────────────────────────────────────────────────────────────────────────────────
// Provider
// ────────────────────────────────────────────────────────────────────────────────

function AuthBridge({ children }: PropsWithChildren) {
  const clerk = useClerk();
  const { isLoaded, isSignedIn, userId, getToken } = useAuth();
  const { user: clerkUser } = useUser();
  // Stale-while-revalidate: a session persisted on this device renders the
  // shell on the very first frame. Waiting for Clerk's script + handshake AND
  // the /auth/me round trip before showing anything cost a returning user
  // several seconds on a phone; both now run in the background and only
  // replace the session if it actually changed (or drop it if it's gone).
  const [session, setSession] = useState<AuthUser | null>(() => {
    const persisted = readAuthSessionSync();
    setCachedAuthSession(persisted);
    return persisted;
  });
  const [initializing, setInitializing] = useState(() => session == null);
  const sessionRef = useRef(session);
  sessionRef.current = session;
  const authRequestId = useRef(0);

  // Keyed on primitives, not the `clerkUser` object: Clerk hands back a new
  // user object every time it refreshes its client (including after every
  // failed token fetch), which re-ran the session effect below, which fetched
  // /auth/me again, which failed the token again… — an endless 401 → 429 loop
  // that kept the app on "Opening BCMS..." because `initializing` was only
  // cleared by the latest run and every run got superseded.
  const clerkEmail = clerkUser?.primaryEmailAddress?.emailAddress ?? null;
  const currentUser: CurrentUser = useMemo(() => {
    if (!isSignedIn || !userId) {
      return null;
    }
    return { uid: userId, email: clerkEmail };
  }, [isSignedIn, userId, clerkEmail]);

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

      // A cached session for a different account must not render while we
      // load the right one.
      if (sessionRef.current && sessionRef.current.uid !== currentUser.uid) {
        setSession(null);
        setInitializing(true);
      }

      try {
        let nextSession!: AuthUser;
        // A plain network error/timeout (the 15s abort in apiClient) just means
        // the backend was briefly slow or unreachable, not that the session is
        // bad — retry a couple of times with backoff before giving up and
        // falling back to the cached session below, instead of permanently
        // settling for stale data after a single slow request.
        const maxTransientRetries = 2;
        for (let transientAttempt = 0; ; transientAttempt++) {
          try {
            nextSession = await fetchMeFromBackend(currentUser);
            break;
          } catch (error) {
            if (error instanceof ApiError && error.status === 401) {
              // Clerk still lists a session but the backend rejects its token (it
              // was revoked/expired server-side, or the user was deleted). Retry
              // once with a freshly minted token; if that also fails the session
              // is dead, so drop it and go to /login instead of spinning forever.
              const freshToken = await getToken({ skipCache: true }).catch(() => null);
              if (!freshToken) throw new DeadSessionError();
              try {
                nextSession = await fetchMeFromBackend(currentUser);
                break;
              } catch (retryError) {
                if (retryError instanceof ApiError && retryError.status === 401) throw new DeadSessionError();
                throw retryError;
              }
            }

            if (transientAttempt >= maxTransientRetries) throw error;
            await new Promise((r) => setTimeout(r, (transientAttempt + 1) * 1000));
          }
        }
        setCachedAuthSession(nextSession);
        await saveAuthSession(nextSession);
        if (mounted && requestId === authRequestId.current) {
          // Keep the optimistic object when nothing changed, so revalidation
          // doesn't re-render every session consumer for no reason.
          setSession((previous) => (
            previous && JSON.stringify(previous) === JSON.stringify(nextSession) ? previous : nextSession
          ));
        }
      } catch (error) {
        if (error instanceof DeadSessionError) {
          console.warn('[AuthContext] Clerk session is no longer valid; signing out.');
          try {
            await clerk.signOut();
          } catch {
            // The session may already be gone server-side; local cleanup below
            // is what matters.
          }
          setCachedAuthSession(null);
          await clearAuthSession();
          if (mounted && requestId === authRequestId.current) {
            setSession(null);
          }
          return;
        }

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
    // `clerk` and `getToken` are stable Clerk handles; the effect must only
    // re-run when the signed-in identity actually changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoaded, currentUser]);

  const reloadSession = useCallback(async () => {
    // Read the live Clerk user, not the render-time `currentUser`: callers run
    // right after clerk.setActive(), before React has re-rendered, so the
    // closure still says "signed out" and the profile was never loaded here —
    // a failed profile load then left the user on /login with no message.
    const liveUser: CurrentUser = clerk.user
      ? { uid: clerk.user.id, email: clerk.user.primaryEmailAddress?.emailAddress ?? null }
      : currentUser;

    if (!liveUser) {
      setSession(null);
      return null;
    }

    const nextSession = await fetchMeFromBackend(liveUser);
    setCachedAuthSession(nextSession);
    setSession(nextSession);
    await saveAuthSession(nextSession);
    return nextSession;
  }, [clerk, currentUser]);

  const signOut = useCallback(async () => {
    await clerk.signOut();
    // A parent's child selection must not leak into the next account on this device.
    setActiveChildId(null);
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
    // prefetchUI={false}: we drive Clerk headlessly (custom login/signup
    // forms), so its prebuilt UI bundle (~220 kB over four requests, fetched
    // on every cold start) was pure overhead on the critical path.
    <ClerkProvider publishableKey={CLERK_PUBLISHABLE_KEY} prefetchUI={false} telemetry={false}>
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
