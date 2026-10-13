import { eq } from 'drizzle-orm';
import { db } from '../db';
import { users } from '../db/schema';
import { ensurePendingAccessRequest, upsertAccount, type SignupIdentity } from './accountSignup';
import type { ChildInput } from './familyJoin';
import { createChildrenForParent, placeChildrenForParent } from './familyJoinService';

export type ClubCodeSignup = SignupIdentity & {
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
        const user = await upsertAccount(tx, input.existingUserId, {
            firebaseUid: input.firebaseUid,
            email: input.email,
            name: input.name,
            firstName: input.firstName,
            lastName: input.lastName,
            role: input.code.role as typeof users.$inferInsert.role,
            status: needsApproval ? 'pending' : 'active',
            clubId: input.code.clubId,
            ...(input.phone ? { phone: input.phone } : {}),
        });

        let status: 'active' | 'pending' = needsApproval ? 'pending' : 'active';
        let created: { id: number }[] = [];
        let requested: { childFirstName: string; childLastName: string }[] = [];

        if (needsApproval) {
            await ensurePendingAccessRequest(tx, user, input.code.clubId, 'coach');
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
