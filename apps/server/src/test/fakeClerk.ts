/**
 * Import right after pgliteEnv in a test that drives real routes: replaces
 * lib/clerkAuth.ts so a Bearer token `test:<uid>:<email>` is "verified" as
 * that Clerk identity (an empty email = no verified email). Nothing else of
 * the auth path is faked.
 */
import type { ClerkAuthUser } from '../lib/clerkAuth';

const clerkPath = require.resolve('../lib/clerkAuth');

let verifications = 0;
/** How many tokens were verified so far — a request should cost exactly one. */
export const verifyCount = () => verifications;

async function verifyBearerToken(token: string): Promise<ClerkAuthUser> {
    verifications += 1;
    const [scheme, uid, email] = token.split(':');
    if (scheme !== 'test' || !uid) throw new Error('invalid test token');
    return { uid, email: email || null };
}

require.cache[clerkPath] = {
    id: clerkPath,
    filename: clerkPath,
    loaded: true,
    exports: { verifyBearerToken, deleteClerkUser: async () => undefined },
} as NodeJS.Module;

export const bearer = (uid: string, email: string | null) => `Bearer test:${uid}:${email ?? ''}`;
