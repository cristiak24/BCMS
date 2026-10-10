import { getClerk } from '../config/clerk';
import { apiFetch } from './apiClient';
import type { AuthUser } from '../utils/authSession';

// ────────────────────────────────────────────────────────────────────────────────
// Response shapes
// ────────────────────────────────────────────────────────────────────────────────

export type SecondFactorChallenge = {
  strategy: 'email_code' | 'phone_code' | 'totp' | 'backup_code';
  /** Where the code went ("m***@gmail.com"), for code strategies. */
  sentTo: string | null;
  /** True when Clerk wants it because this is a new device (Device Trust). */
  newDevice: boolean;
};

export type LoginResponse = {
  success: boolean;
  user?: AuthUser;
  error?: string;
  /** Clerk wants a code before the session starts (new device or 2FA). */
  secondFactor?: SecondFactorChallenge;
};

// The sign-in waiting for its second factor (one at a time, per tab).
let pendingSecondFactor: SecondFactorChallenge | null = null;

type ClerkSignIn = {
  status: string | null;
  createdSessionId: string | null;
  supportedSecondFactors?: Array<{ strategy: string; emailAddressId?: string; phoneNumberId?: string; safeIdentifier?: string }> | null;
  prepareSecondFactor: (params: any) => Promise<ClerkSignIn>;
  attemptSecondFactor: (params: any) => Promise<ClerkSignIn>;
};

/**
 * Ask Clerk to send the code (email first, then SMS; an authenticator app or
 * backup code needs nothing sent). Covers both "needs_second_factor" (2FA)
 * and "needs_client_trust" (a sign-in from a new device), which the login
 * screen used to report as a dead-end error.
 */
async function startSecondFactor(signIn: ClerkSignIn): Promise<SecondFactorChallenge | null> {
  const factors = signIn.supportedSecondFactors ?? [];
  const pick = (strategy: string) => factors.find((factor) => factor.strategy === strategy);
  const factor = pick('email_code') ?? pick('phone_code') ?? pick('totp') ?? pick('backup_code');
  if (!factor) return null;
  if (factor.strategy === 'email_code') {
    await signIn.prepareSecondFactor({ strategy: 'email_code', emailAddressId: factor.emailAddressId });
  } else if (factor.strategy === 'phone_code') {
    await signIn.prepareSecondFactor({ strategy: 'phone_code', phoneNumberId: factor.phoneNumberId });
  }
  return {
    strategy: factor.strategy as SecondFactorChallenge['strategy'],
    sentTo: factor.safeIdentifier ?? null,
    newDevice: signIn.status === 'needs_client_trust',
  };
}

export type SignupPayload = {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  /** Required: the role and club come from the invite, never from the client. */
  inviteToken: string;
  phone: string;
  /** Team-code signups only: who is registering, and for whom. */
  joinAs?: 'parent' | 'player';
  /** Team codes send birthDate; parent codes/links send birthYear. */
  children?: { firstName: string; lastName: string; birthDate?: string; birthYear?: number }[];
  birthDate?: string;
};

export type InviteDetails = {
  email: string | null;
  /** null for a team code: the person picks parent or player on the form. */
  role: string | null;
  clubId: number | null;
  clubName: string | null;
  source?: 'invitation' | 'manage-access' | 'code' | 'team' | 'guardian';
  teamId?: number | null;
  teamName?: string | null;
  /** Personal parent invite: the child it links to. */
  childName?: string | null;
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

    // Only an *active* session can be reused. A pending one (Clerk wants a
    // session task first) is invisible to useAuth(), so reusing it bounced the
    // user straight back to /login.
    if (clerk.session) {
      if (clerk.session.status === 'active' && alreadySignedInAs() === email) {
        return { success: true };
      }
      await clerk.signOut().catch(() => undefined);
    }

    // Sign-in can succeed while Clerk still holds the session as "pending"
    // behind a task (e.g. reset-password for a password found in a breach).
    // useAuth() treats that as signed out, so the app sent the user back to
    // /login even though Clerk had emailed a new-sign-in notice. Report it and
    // drop the half-open session so "Ai uitat parola?" can run cleanly.
    const pendingTaskResult = async (): Promise<LoginResponse | null> => {
      const session = clerk.session;
      if (!session || session.status !== 'pending') return null;
      const task = session.currentTask?.key ?? 'pending';
      await clerk.signOut().catch(() => undefined);
      if (task === 'reset-password') {
        return {
          success: false,
          error: 'Trebuie să îți schimbi parola înainte de a intra (parola a apărut într-o scurgere de date publică). Apasă „Ai uitat parola?” ca să setezi una nouă. (cod: reset-password)',
        };
      }
      return {
        success: false,
        error: `Contul necesită un pas suplimentar înainte de conectare. Contactează administratorul clubului. (cod: ${task})`,
      };
    };

    const attempt = async () => {
      const result = await clerk.client.signIn.create({
        strategy: 'password',
        identifier: email,
        password,
      });

      if (result.status === 'complete' && result.createdSessionId) {
        await clerk.setActive({ session: result.createdSessionId });
        return (await pendingTaskResult()) ?? ({ success: true } as LoginResponse);
      }

      if (result.status === 'needs_second_factor' || result.status === 'needs_client_trust') {
        const challenge = await startSecondFactor(result as unknown as ClerkSignIn);
        if (challenge) {
          pendingSecondFactor = challenge;
          return { success: false, secondFactor: challenge } as LoginResponse;
        }
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
        if (clerk.session?.status === 'active' && alreadySignedInAs() === email) {
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

  /** Finish a sign-in that stopped at the second factor (see login()). */
  async verifySecondFactor(code: string): Promise<LoginResponse> {
    const clerk = await getClerk().catch(() => null);
    if (!clerk || !pendingSecondFactor) {
      return { success: false, error: 'Sesiunea de conectare a expirat. Introdu din nou emailul și parola.' };
    }
    try {
      const signIn = clerk.client.signIn as unknown as ClerkSignIn;
      const result = await signIn.attemptSecondFactor({ strategy: pendingSecondFactor.strategy, code: code.trim() });
      if (result.status === 'complete' && result.createdSessionId) {
        pendingSecondFactor = null;
        await clerk.setActive({ session: result.createdSessionId });
        return { success: true };
      }
      return { success: false, error: `Codul nu a fost acceptat. (cod: ${result.status})` };
    } catch (error) {
      return { success: false, error: describeSecondFactorError(error) };
    }
  },

  /** Send the second-factor code again (email/SMS strategies). */
  async resendSecondFactor(): Promise<LoginResponse> {
    const clerk = await getClerk().catch(() => null);
    if (!clerk || !pendingSecondFactor) {
      return { success: false, error: 'Sesiunea de conectare a expirat. Introdu din nou emailul și parola.' };
    }
    try {
      const challenge = await startSecondFactor(clerk.client.signIn as unknown as ClerkSignIn);
      if (challenge) pendingSecondFactor = challenge;
      return { success: false, secondFactor: pendingSecondFactor ?? undefined };
    } catch (error) {
      return { success: false, error: describeSecondFactorError(error) };
    }
  },

  cancelSecondFactor() {
    pendingSecondFactor = null;
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
        body: JSON.stringify({
          name,
          inviteToken: payload.inviteToken,
          phone: payload.phone,
          joinAs: payload.joinAs,
          children: payload.children,
          birthDate: payload.birthDate,
        }),
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
      teamId: data.teamId ?? null,
      teamName: data.teamName ?? null,
      childName: data.childName ?? null,
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

function describeSecondFactorError(error: any) {
  const code = error?.errors?.[0]?.code as string | undefined;
  if (code === 'form_code_incorrect') return 'Codul este greșit. Verifică ultimul email/SMS primit.';
  if (code === 'verification_expired') return 'Codul a expirat. Apasă „Trimite din nou”.';
  if (code === 'too_many_requests') return 'Prea multe încercări. Așteaptă un minut și încearcă din nou.';
  return error?.errors?.[0]?.longMessage ?? error?.message ?? 'Nu am putut verifica codul.';
}
