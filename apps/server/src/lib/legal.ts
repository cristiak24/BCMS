/**
 * Version of the Terms + Privacy Policy + Cookie notice published on the site.
 * Bump it (and the date in apps/client/config/legal.ts, which must match) when
 * the texts change in a way people have to agree to again: every account is
 * then asked to accept the new version.
 */
export const LEGAL_VERSION = '2026-10-13';

export const PRIVACY_REQUEST_TYPES = ['erasure'] as const;
export type PrivacyRequestType = (typeof PRIVACY_REQUEST_TYPES)[number];

/** Columns that are never handed back to the person, even in their own export. */
const EXPORT_HIDDEN_USER_FIELDS = ['passwordHash', 'stripeCustomerId', 'uid', 'clerkUserId'] as const;

export function stripHiddenUserFields<T extends Record<string, unknown>>(user: T) {
    const copy: Record<string, unknown> = { ...user };
    for (const field of EXPORT_HIDDEN_USER_FIELDS) delete copy[field];
    return copy;
}
