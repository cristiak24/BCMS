/**
 * Stand-in for apps/server/src/lib/clerkAuth.ts in the E2E API only (start.ts
 * swaps it in through Module._resolveFilename). A Bearer token
 * `test:<email>` is "verified" as the Clerk identity { uid: 'test_<email>',
 * email }. Everything after token verification is the real server code.
 */
export type ClerkAuthUser = { uid: string; email: string | null };

export async function verifyBearerToken(token: string): Promise<ClerkAuthUser> {
    const match = /^test:(.+@.+)$/.exec(token);
    if (!match) throw new Error('invalid E2E token');
    const email = match[1].trim().toLowerCase();
    return { uid: `test_${email}`, email };
}

export async function deleteClerkUser(): Promise<void> {
    // Nothing to delete: there is no Clerk in the E2E environment.
}
