/**
 * Which email of a Clerk user may be trusted as theirs. Only a verified
 * address proves ownership: an unverified one can be typed by anyone, and the
 * email is what links a first sign-in to an existing account row and what an
 * invitation is matched against.
 */

type ClerkEmailAddress = {
    id: string;
    emailAddress: string;
    verification: { status: string } | null;
};

export type ClerkUserEmails = {
    primaryEmailAddressId: string | null;
    emailAddresses: ClerkEmailAddress[];
};

const isVerified = (address: ClerkEmailAddress) => address.verification?.status === 'verified';

/** The primary address when verified, else the first verified one, else null. */
export function verifiedEmailOf(user: ClerkUserEmails): string | null {
    const primary = user.emailAddresses.find((address) => address.id === user.primaryEmailAddressId);
    if (primary && isVerified(primary)) return primary.emailAddress;
    return user.emailAddresses.find(isVerified)?.emailAddress ?? null;
}

/**
 * The email from a session token's custom claims, only when the same token
 * also says it is verified (`email_verified: true`). Without that claim the
 * caller looks the address up from Clerk's API instead.
 */
export function verifiedEmailClaim(payload: Record<string, unknown>): string | null {
    const email = payload.email;
    const verified = payload.email_verified;
    if (typeof email !== 'string' || !email) return null;
    return verified === true || verified === 'true' ? email : null;
}
