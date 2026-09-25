import { createClerkClient, verifyToken } from '@clerk/backend';
import { loadServerEnv } from './loadEnv';

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

    const clerkUser = await clerkClient.users.getUser(uid);
    const email = clerkUser.primaryEmailAddress?.emailAddress
        ?? clerkUser.emailAddresses[0]?.emailAddress
        ?? null;

    return { uid, email };
}
