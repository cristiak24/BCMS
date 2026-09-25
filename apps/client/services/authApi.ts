import { getClerk } from '../config/clerk';
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

export type ResetPasswordResponse = {
  success: boolean;
  error?: string;
};

// ────────────────────────────────────────────────────────────────────────────────
// authApi
// ────────────────────────────────────────────────────────────────────────────────

export const authApi = {
  /**
   * Sign in with Clerk, then the AuthContext automatically calls /me to load
   * the Postgres profile once the session becomes active.
   */
  async login(email: string, password: string): Promise<LoginResponse> {
    try {
      const clerk = await getClerk();
      const result = await clerk.client.signIn.create({
        strategy: 'password',
        identifier: email,
        password,
      });

      if (result.status === 'complete' && result.createdSessionId) {
        await clerk.setActive({ session: result.createdSessionId });
        return { success: true };
      }

      return { success: false, error: 'Contul necesită un pas suplimentar de verificare.' };
    } catch (error: any) {
      return { success: false, error: mapClerkError(error) ?? 'Email sau parola incorecte.' };
    }
  },

  /**
   * 1. Create the Clerk account
   * 2. Call /api/auth/complete-signup (or complete-invite-signup) to create the
   *    Postgres profile
   */
  async signup(payload: SignupPayload): Promise<{ success: boolean; error?: string }> {
    const clerk = await getClerk();
    let createdAccount = false;

    try {
      const signUp = await clerk.client.signUp.create({
        emailAddress: payload.email,
        password: payload.password,
        firstName: payload.firstName,
        lastName: payload.lastName,
      });
      createdAccount = Boolean(signUp.createdUserId);

      if (signUp.status !== 'complete' || !signUp.createdSessionId) {
        return {
          success: false,
          error: 'Contul necesită un pas suplimentar de verificare. Contactează administratorul clubului.',
        };
      }

      await clerk.setActive({ session: signUp.createdSessionId });

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

      return { success: true };
    } catch (error: any) {
      // Roll back the Clerk account if the backend profile step fails.
      if (createdAccount) {
        try {
          await clerk.user?.delete();
        } catch {
          // ignore cleanup errors
        }
        try {
          await clerk.signOut();
        } catch {
          // ignore cleanup errors
        }
      }

      return {
        success: false,
        error: mapClerkError(error) ?? (error instanceof Error ? error.message : 'Signup failed.'),
      };
    }
  },

  /**
   * Validate an invite token via the backend (no Clerk call needed).
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

  /** Starts Clerk's reset-by-email-code flow; finish it with resetPassword(). */
  async forgotPassword(email: string): Promise<ForgotPasswordResponse> {
    const ack = { success: true, message: 'Daca exista un cont cu acest email, vei primi un cod de resetare.' };

    try {
      const clerk = await getClerk();
      await clerk.client.signIn.create({
        strategy: 'reset_password_email_code',
        identifier: email.trim().toLowerCase(),
      });
      return ack;
    } catch {
      // Same ack regardless of outcome — don't leak whether the email is registered.
      return ack;
    }
  },

  /** Completes the flow started by forgotPassword() with the emailed code. */
  async resetPassword(code: string, newPassword: string): Promise<ResetPasswordResponse> {
    try {
      const clerk = await getClerk();
      const signIn = clerk.client.signIn;
      const attempted = await signIn.attemptFirstFactor({ strategy: 'reset_password_email_code', code });

      if (attempted.status !== 'complete' || !attempted.createdSessionId) {
        return { success: false, error: 'Codul introdus este incorect sau a expirat.' };
      }

      await signIn.resetPassword({ password: newPassword });
      await clerk.setActive({ session: attempted.createdSessionId });
      return { success: true };
    } catch (error: any) {
      return { success: false, error: mapClerkError(error) ?? 'Nu am putut reseta parola.' };
    }
  },
};

// ────────────────────────────────────────────────────────────────────────────────
// Clerk error → human-readable message
// ────────────────────────────────────────────────────────────────────────────────

function mapClerkError(error: unknown): string | null {
  const code = (error as { errors?: Array<{ code?: string }> } | undefined)?.errors?.[0]?.code;

  switch (code) {
    case 'form_password_incorrect':
    case 'form_identifier_not_found':
      return 'Email sau parola incorecte.';
    case 'form_identifier_exists':
      return 'This email is already registered.';
    case 'form_password_pwned':
    case 'form_password_length_too_short':
    case 'form_password_size_in_bytes_exceeded':
      return 'Password must be at least 8 characters and not previously leaked.';
    case 'form_param_format_invalid':
      return 'Introdu o adresa de email valida.';
    case 'too_many_requests':
      return 'Prea multe incercari. Incearca din nou mai tarziu.';
    default:
      return null;
  }
}
