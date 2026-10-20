import { and, eq, isNull, or, sql } from 'drizzle-orm';
import { db } from '../db';
import { users } from '../db/schema';

/**
 * Finds the account row of a signed-in Clerk identity, linking a first sign-in
 * to an existing row by email when that is safe.
 *
 * Linking by email is how rows created before the person ever signed in (or
 * before the move from Firebase to Clerk) get their sign-in. It only happens
 * when the email is VERIFIED (lib/clerkEmail.ts, so the caller owns it) and
 * the row isn't already bound to another Clerk account: a row that belongs to
 * someone else is never re-pointed at the caller.
 */

type IdentityRow = Pick<typeof users.$inferSelect, 'clerkUserId'>;

/** Clerk user ids look like `user_2abc…`; anything else is a pre-Clerk (Firebase) uid. */
export function isClerkUid(value: string) {
    return value.startsWith('user_');
}

/**
 * Whether an existing row may be (re)bound to `uid`: it is unbound, already
 * this uid, or still carries a pre-Clerk uid that nobody can sign in with
 * anymore. A row bound to a different Clerk account never is.
 */
export function canLinkToUid(row: IdentityRow, uid: string) {
    if (!row.clerkUserId || row.clerkUserId === uid) return true;
    return !isClerkUid(row.clerkUserId);
}

export async function findOrLinkUser(identity: { uid: string; email: string | null }) {
    const [own] = await db
        .select()
        .from(users)
        .where(or(eq(users.clerkUserId, identity.uid), eq(users.uid, identity.uid)))
        .limit(1);
    if (own) return own;

    const email = identity.email?.trim().toLowerCase();
    if (!email) return null;

    const [byEmail] = await db.select().from(users).where(sql`lower(${users.email}) = ${email}`).limit(1);
    if (!byEmail || !canLinkToUid(byEmail, identity.uid)) return null;

    // Guarded on the uid read above, so two first sign-ins racing for the same
    // row cannot both bind it.
    const [linked] = await db
        .update(users)
        .set({ clerkUserId: identity.uid, updatedAt: new Date().toISOString() })
        .where(and(
            eq(users.id, byEmail.id),
            byEmail.clerkUserId ? eq(users.clerkUserId, byEmail.clerkUserId) : isNull(users.clerkUserId),
        ))
        .returning();
    return linked ?? null;
}
