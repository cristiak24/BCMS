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
  /** Required: the role and club come from the invite, never from the client. */
  inviteToken: string;
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
    const clerk = await getClerk().catch(() => null);
    if (!clerk) {
      return { success: false, error: 'Autentificarea nu este pregătită încă. Încearcă din nou în câteva secunde.' };
    }

    // Clerk may already hold a session the app never picked up (an earlier
    // attempt that signed in but whose profile load failed, or a double
    // submit). Signing in again then fails with "session_exists", which used
    // to be shown as "wrong email or password" even though the credentials
    // were fine and Clerk had just emailed a new-sign-in notice.
    const alreadySignedInAs = () =>
      clerk.user?.primaryEmailAddress?.emailAddress?.toLowerCase() ?? null;

    if (clerk.session) {
      if (alreadySignedInAs() === email) {
        return { success: true };
      }
      await clerk.signOut().catch(() => undefined);
    }

    const attempt = async () => {
      const result = await clerk.client.signIn.create({
        strategy: 'password',
        identifier: email,
        password,
      });

      if (result.status === 'complete' && result.createdSessionId) {
        await clerk.setActive({ session: result.createdSessionId });
        return { success: true } as LoginResponse;
      }

      return {
        success: false,
        error: `Contul necesită un pas suplimentar de verificare. Verifică emailul sau contactează administratorul clubului. (cod: ${result.status})`,
      } as LoginResponse;
    };

    try {
      return await attempt();
    } catch (error: any) {
      if (isAlreadySignedInError(error)) {
        if (alreadySignedInAs() === email) {
          return { success: true };
        }
        // Signed in as someone else: drop that session and try once more.
        try {
          await clerk.signOut();
          return await attempt();
        } catch (retryError) {
          return { success: false, error: describeLoginError(retryError) };
        }
      }
      return { success: false, error: describeLoginError(error) };
    }
  },

  /**
   * 1. Create the Clerk account
   * 2. Call /api/auth/complete-invite-signup to create the Postgres profile
   *    with the role/club the invite carries
   */
  async signup(payload: SignupPayload): Promise<{ success: boolean; error?: string }> {
    if (!payload.inviteToken) {
      return { success: false, error: 'Ai nevoie de un cod de invitație pentru a-ți crea cont.' };
    }

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

      await apiFetch('/auth/complete-invite-signup', {
        method: 'POST',
        body: JSON.stringify({ name, inviteToken: payload.inviteToken }),
      });

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

function clerkErrorCode(error: unknown) {
  return (error as { errors?: Array<{ code?: string }> } | undefined)?.errors?.[0]?.code;
}

function isAlreadySignedInError(error: unknown) {
  const code = clerkErrorCode(error);
  return code === 'session_exists' || code === 'identifier_already_signed_in';
}

/**
 * Only real credential failures say "wrong email or password". Anything else
 * (network, Clerk hiccup, an unexpected state) gets a neutral message and is
 * logged, so a failure after a successful sign-in is no longer misreported.
 */
function describeLoginError(error: unknown) {
  const mapped = mapClerkError(error);
  if (mapped) return mapped;
  const code = clerkErrorCode(error)
    ?? (error instanceof Error ? error.name : null)
    ?? 'unknown';
  console.error('[authApi.login] Unexpected sign-in error:', code, error);
  // The code is shown on screen so it can be reported from a phone, where
  // there is no console to read.
  return `Nu am putut finaliza conectarea. Încearcă din nou. (cod: ${code})`;
}

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
