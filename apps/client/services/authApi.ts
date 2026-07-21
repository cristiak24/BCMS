import {
  createUserWithEmailAndPassword,
  deleteUser,
  signInWithCustomToken,
  signInWithEmailAndPassword,
  type User,
} from 'firebase/auth';
import { firebaseAuth } from '../config/firebase';
import { apiFetch } from './apiClient';
import type { AuthUser } from '../utils/authSession';

// ────────────────────────────────────────────────────────────────────────────────
// Response shapes
// ────────────────────────────────────────────────────────────────────────────────

export type LoginResponse = {
  success: boolean;
  user?: AuthUser;
  error?: string;
};

type LegacyLoginResponse = {
  success: boolean;
  customToken?: string;
  user?: AuthUser;
  error?: string;
};

export type SignupPayload = {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  role?: 'player' | 'coach' | 'parent';
  inviteToken?: string;
};

export type InviteDetails = {
  email: string | null;
  role: string;
  clubId: number | null;
  clubName: string | null;
  source?: 'invitation' | 'manage-access';
};

export type ForgotPasswordResponse = {
  success: boolean;
  message?: string;
};

// ────────────────────────────────────────────────────────────────────────────────
// authApi
// ────────────────────────────────────────────────────────────────────────────────

export const authApi = {
  /**
   * Sign in with Firebase, then the AuthContext automatically calls /me to
   * load the Postgres profile. This just triggers the Firebase auth state change.
   */
  async login(email: string, password: string): Promise<LoginResponse> {
    try {
      await signInWithEmailAndPassword(firebaseAuth, email, password);
      // AuthContext onAuthStateChanged will pick this up and call /api/auth/me
      return { success: true };
    } catch (error: any) {
      if (shouldTryLegacyLogin(error?.code)) {
        try {
          const legacy = await apiFetch<LegacyLoginResponse>('/auth/legacy-login', {
            method: 'POST',
            body: JSON.stringify({ email, password }),
          });

          if (legacy.success && legacy.customToken) {
            await signInWithCustomToken(firebaseAuth, legacy.customToken);
            return { success: true, user: legacy.user };
          }

          return {
            success: false,
            error: legacy.error || 'Email sau parola incorecte.',
          };
        } catch (legacyError) {
          return {
            success: false,
            error: legacyError instanceof Error ? legacyError.message : 'Email sau parola incorecte.',
          };
        }
      }

      const msg = mapFirebaseAuthError(error.code) ?? (error instanceof Error ? error.message : 'Invalid credentials.');
      return { success: false, error: msg };
    }
  },

  /**
   * 1. Create Firebase Auth account
   * 2. Call /api/auth/complete-signup to create the Postgres profile
   * 3. Call /api/auth/complete-invite-signup if an inviteToken is present
   */
  async signup(payload: SignupPayload): Promise<{ success: boolean; error?: string }> {
    let createdUser: User | null = null;

    try {
      const credential = await createUserWithEmailAndPassword(
        firebaseAuth,
        payload.email,
        payload.password,
      );
      createdUser = credential.user as any;

      const name = `${payload.firstName.trim()} ${payload.lastName.trim()}`.trim();

      if (payload.inviteToken) {
        await apiFetch('/auth/complete-invite-signup', {
          method: 'POST',
          body: JSON.stringify({ name, inviteToken: payload.inviteToken }),
        });
      } else {
        await apiFetch('/auth/complete-signup', {
          method: 'POST',
          body: JSON.stringify({ name, role: payload.role ?? 'player' }),
        });
      }

      // AuthContext onAuthStateChanged will now pick up the user and load session
      return { success: true };
    } catch (error: any) {
      // Roll back Firebase user if backend fails
      if (createdUser) {
        try {
          await deleteUser(createdUser as any);
        } catch {
          // ignore cleanup errors
        }
      }

      const msg = mapFirebaseAuthError(error.code) ?? (error instanceof Error ? error.message : 'Signup failed.');
      return { success: false, error: msg };
    }
  },

  /**
   * Validate an invite token via the backend (no Firebase call needed).
   */
  async getInviteDetails(token: string): Promise<InviteDetails> {
    const data = await apiFetch<{ success: boolean } & InviteDetails>(
      `/auth/invites/validate?token=${encodeURIComponent(token)}`,
    );
    return {
      email: data.email ?? null,
      role: data.role,
      clubId: data.clubId,
      clubName: data.clubName,
      source: data.source,
    };
  },

  async forgotPassword(email: string): Promise<ForgotPasswordResponse> {
    const normalizedEmail = email.trim().toLowerCase();

    const response = await apiFetch<{ success: boolean; message?: string }>('/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ email: normalizedEmail }),
    });

    return {
      success: true,
      message: response.message || 'Emailul de resetare a parolei a fost trimis.',
    };
  },
};

function shouldTryLegacyLogin(code?: string) {
  return [
    'auth/invalid-credential',
    'auth/user-not-found',
    'auth/wrong-password',
  ].includes(String(code ?? ''));
}

// ────────────────────────────────────────────────────────────────────────────────
// Firebase error → human-readable message
// ────────────────────────────────────────────────────────────────────────────────

function mapFirebaseAuthError(code?: string): string | null {
  switch (code) {
    case 'auth/user-not-found':
    case 'auth/wrong-password':
    case 'auth/invalid-credential':
      return 'Email sau parola incorecte.';
    case 'auth/email-already-in-use':
      return 'This email is already registered.';
    case 'auth/weak-password':
      return 'Password must be at least 6 characters.';
    case 'auth/invalid-email':
      return 'Introdu o adresa de email valida.';
    case 'auth/too-many-requests':
      return 'Prea multe incercari. Incearca din nou mai tarziu.';
    case 'auth/network-request-failed':
      return 'Eroare de retea. Verifica conexiunea.';
    default:
      return null;
  }
}
