import { createClerkClient, verifyToken } from '@clerk/backend';
import { loadServerEnv } from './loadEnv';
import { getOrCompute } from './microCache';

loadServerEnv();

const secretKey = process.env.CLERK_SECRET_KEY?.trim();

if (!secretKey) {
    throw new Error('CLERK_SECRET_KEY is required.');
}

const clerkClient = createClerkClient({ secretKey });

export type ClerkAuthUser = {
    uid: string;
    email: string | null;
};

/**
 * Verifies a Clerk session token and resolves the caller's identity.
 *
 * The email isn't in the default session token claims, so this fetches it from
 * Clerk's API. Add an `email` claim to the session token customization in the
 * Clerk dashboard to skip that round trip — this reads `payload.email` first
 * and only falls back to the API call when it's absent.
 */
export async function verifyBearerToken(token: string): Promise<ClerkAuthUser> {
    const payload = await verifyToken(token, { secretKey });
    const uid = payload.sub;
    const claimedEmail = (payload as Record<string, unknown>).email;

    if (typeof claimedEmail === 'string' && claimedEmail) {
        return { uid, email: claimedEmail };
    }

    // This ran on EVERY authenticated request — a round trip to Clerk's API
    // (and against its rate limit) before any route work started, several
    // times over when a screen loads its data in parallel. The email is only
    // used to link a first sign-in to an existing row, so a short-lived cache
    // is plenty; concurrent requests share one lookup.
    const email = await getOrCompute(`clerk-email:${uid}`, CLERK_EMAIL_TTL_MS, async () => {
        const clerkUser = await clerkClient.users.getUser(uid);
        return clerkUser.primaryEmailAddress?.emailAddress
            ?? clerkUser.emailAddresses[0]?.emailAddress
            ?? null;
    });

    return { uid, email };
}

const CLERK_EMAIL_TTL_MS = 10 * 60 * 1000;

/**
 * Deletes a Clerk user (their sign-in). A 404 is treated as success — legacy
 * rows can carry a pre-Clerk uid, and a user already removed needs no action.
 */
export async function deleteClerkUser(clerkUserId: string): Promise<void> {
    try {
        await clerkClient.users.deleteUser(clerkUserId);
    } catch (error) {
        const status = (error as { status?: number } | null)?.status;
        if (status === 404) {
            return;
        }
        throw error;
    }
}
