import { and, eq } from 'drizzle-orm';
import { db } from '../db';
import { accessRequests, users } from '../db/schema';
import type { ChildInput } from './familyJoin';
import { createChildrenForParent, placeChildrenForParent } from './familyJoinService';

export type ClubCodeSignup = {
    /** The caller's existing (not active) account row, if they already have one. */
    existingUserId: number | null;
    firebaseUid: string;
    email: string;
    name: string;
    firstName: string;
    lastName: string;
    phone: string | null;
    code: { role: string; clubId: number };
    /** The code's team, already checked to belong to the club. */
    team: { id: number; name: string } | null;
    children: ChildInput[] | null;
};

/**
 * The database side of signing up with a club code, all or nothing: the
 * account row, the children and the requests land together, so a failure
 * halfway never leaves an active account with no children (which the "active
 * account" guard would then refuse to retry).
 */
export async function registerWithClubCode(input: ClubCodeSignup) {
    const needsApproval = input.code.role === 'coach';
    return db.transaction(async (tx) => {
        const values = {
            firebaseUid: input.firebaseUid,
            email: input.email.trim().toLowerCase(),
            name: input.name,
            firstName: input.firstName,
            lastName: input.lastName,
            role: input.code.role as typeof users.$inferInsert.role,
            status: needsApproval ? ('pending' as const) : ('active' as const),
            clubId: input.code.clubId,
            ...(input.phone ? { phone: input.phone } : {}),
        };
        const [user] = input.existingUserId != null
            ? await tx.update(users).set({ ...values, updatedAt: new Date().toISOString() }).where(eq(users.id, input.existingUserId)).returning()
            : await tx.insert(users).values(values).returning();

        let status: 'active' | 'pending' = values.status;
        let created: { id: number }[] = [];
        let requested: { childFirstName: string; childLastName: string }[] = [];

        if (needsApproval) {
            // Opening a second code must not stack a second request for the admin.
            const waiting = await tx.select({ id: accessRequests.id }).from(accessRequests)
                .where(and(
                    eq(accessRequests.userId, user.id),
                    eq(accessRequests.clubId, input.code.clubId),
                    eq(accessRequests.requestedRole, 'coach'),
                    eq(accessRequests.status, 'pending'),
                ))
                .limit(1);
            if (!waiting.length) {
                await tx.insert(accessRequests).values({
                    userId: user.id,
                    clubId: input.code.clubId,
                    userName: user.name,
                    userEmail: user.email,
                    requestedRole: 'coach',
                });
            }
        } else if (input.children && input.team) {
            const placed = await placeChildrenForParent({
                userId: user.id,
                team: { id: input.team.id, clubId: input.code.clubId },
                phone: input.phone ?? '',
                firstName: input.firstName,
                lastName: input.lastName,
                children: input.children,
                tx,
            });
            created = placed.created;
            requested = placed.requested;
            // Every child is already on the roster (second parent of the
            // family): in once the club confirms the link.
            if (created.length === 0 && requested.length > 0) {
                await tx.update(users).set({ status: 'pending' }).where(eq(users.id, user.id));
                status = 'pending';
            }
        } else if (input.children) {
            created = await createChildrenForParent({ userId: user.id, teamId: null, children: input.children, tx });
        }

        return { user, status, created, requested };
    });
}
