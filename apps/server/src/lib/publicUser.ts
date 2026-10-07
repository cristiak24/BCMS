/**
 * A users row without what must never reach a browser: the password hash and
 * the external ids (Clerk/Firebase uid, Stripe customer).
 */
export function publicUser<T extends Record<string, unknown>>(row: T) {
    const { passwordHash: _passwordHash, firebaseUid: _firebaseUid, uid: _uid, stripeCustomerId: _stripeCustomerId, ...safe } = row as T & {
        passwordHash?: unknown;
        firebaseUid?: unknown;
        uid?: unknown;
        stripeCustomerId?: unknown;
    };
    return safe;
}
