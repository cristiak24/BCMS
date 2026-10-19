/**
 * Loading the signed-in account's BCMS profile (/auth/me). Right after signup
 * the profile can lag a moment, so a "not found" is retried once — but a
 * Clerk account that simply has no profile (never invited, or removed) used
 * to retry ten times, then twice more around that: half a minute of spinner
 * and no explanation (audit WP7-E4).
 */

export const PROFILE_MISSING_MESSAGE =
  'Contul tău nu e asociat cu un club. Folosește linkul sau codul de invitație primit de la club, ori cere o invitație administratorului.';

export class ProfileMissingError extends Error {
  constructor() {
    super(PROFILE_MISSING_MESSAGE);
    this.name = 'ProfileMissingError';
  }
}

export async function loadProfileWithRetry<T>(
  fetchOnce: () => Promise<T | null>,
  isMissing: (error: unknown) => boolean,
  { attempts = 2, waitMs = 800, sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)) } = {},
): Promise<T> {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const profile = await fetchOnce();
      if (profile) return profile;
    } catch (error) {
      if (!isMissing(error)) throw error;
    }
    if (attempt < attempts) await sleep(waitMs);
  }
  throw new ProfileMissingError();
}
