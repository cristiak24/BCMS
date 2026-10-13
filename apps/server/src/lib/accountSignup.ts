import { and, eq } from 'drizzle-orm';
import { db } from '../db';
import { accessRequests, teams, users } from '../db/schema';
import type { ChildInput, TeamSignupInput } from './familyJoin';
import { createChildrenForParent, createJoinRequests, type Tx } from './familyJoinService';
import { redeemGuardianInvite } from './guardianInvites';

/**
 * Database side of the invite-signup branches that wait for a club decision
 * (team code, access link) or link a known child (guardian invite). Each runs
 * as one transaction: the account row and everything it needs land together,
 * so a failure never leaves an account the waiting screen can't explain.
 */

export type SignupIdentity = {
    /** The caller's existing (not active) account row, if they already have one. */
    existingUserId: number | null;
    firebaseUid: string;
    email: string;
    name: string;
    firstName: string;
    lastName: string;
};

type Account = Pick<typeof users.$inferInsert, 'firebaseUid' | 'email' | 'name' | 'firstName' | 'lastName' | 'phone' | 'role' | 'status' | 'clubId'>;

/** Creates the account, or rewrites the caller's unfinished one. Email is always stored lowercase (it is unique). */
export async function upsertAccount(tx: Tx, existingUserId: number | null, account: Account) {
    const values = { ...account, email: account.email.trim().toLowerCase() };
    const [user] = existingUserId != null
        ? await tx.update(users).set({ ...values, updatedAt: new Date().toISOString() }).where(eq(users.id, existingUserId)).returning()
        : await tx.insert(users).values(values).returning();
    return user;
}

/** Opening a second link or code must not stack a second request for the admin. */
export async function ensurePendingAccessRequest(
    tx: Tx,
    user: { id: number; name: string | null; email: string },
    clubId: number,
    role: typeof accessRequests.$inferInsert.requestedRole,
) {
    const waiting = await tx.select({ id: accessRequests.id }).from(accessRequests)
        .where(and(
            eq(accessRequests.userId, user.id),
            eq(accessRequests.clubId, clubId),
            eq(accessRequests.requestedRole, role),
            eq(accessRequests.status, 'pending'),
        ))
        .limit(1);
    if (waiting.length) return;
    await tx.insert(accessRequests).values({
        userId: user.id,
        clubId,
        userName: user.name,
        userEmail: user.email,
        requestedRole: role,
    });
}

export async function registerWithTeamCode(input: SignupIdentity & {
    signup: TeamSignupInput;
    team: Pick<typeof teams.$inferSelect, 'id' | 'clubId'>;
}) {
    return db.transaction(async (tx) => {
        const user = await upsertAccount(tx, input.existingUserId, {
            firebaseUid: input.firebaseUid,
            email: input.email,
            name: input.name,
            firstName: input.firstName,
            lastName: input.lastName,
            phone: input.signup.phone,
            role: input.signup.kind,
            // In until a club admin or the team's coach approves a request.
            status: 'pending',
            clubId: input.team.clubId,
        });
        const requests = await createJoinRequests({
            userId: user.id,
            team: input.team,
            input: input.signup,
            firstName: input.firstName,
            lastName: input.lastName,
            tx,
        });
        return { user, requests };
    });
}

export async function registerWithAccessLink(input: SignupIdentity & {
    phone: string | null;
    link: { role: string; clubId: number };
    /** The link's team, already checked to belong to the club; only matters for parents with children. */
    team: { id: number; name: string } | null;
    children: ChildInput[] | null;
}) {
    return db.transaction(async (tx) => {
        const user = await upsertAccount(tx, input.existingUserId, {
            firebaseUid: input.firebaseUid,
            email: input.email,
            name: input.name,
            firstName: input.firstName,
            lastName: input.lastName,
            role: input.link.role as typeof users.$inferInsert.role,
            status: 'pending',
            clubId: input.link.clubId,
            ...(input.phone ? { phone: input.phone } : {}),
        });

        if (input.children && input.team) {
            // Link tied to a team: the children wait in the team's join
            // requests, where a club admin or the coach approves them (and
            // that approval lets the account in).
            await createJoinRequests({
                userId: user.id,
                team: { id: input.team.id, clubId: input.link.clubId },
                input: { kind: 'parent', phone: input.phone ?? '', children: input.children },
                firstName: input.firstName,
                lastName: input.lastName,
                tx,
            });
            return { user, queuedForTeam: true };
        }

        if (input.children) {
            await createChildrenForParent({ userId: user.id, teamId: null, children: input.children, tx });
        }
        await ensurePendingAccessRequest(tx, user, input.link.clubId, input.link.role as typeof accessRequests.$inferInsert.requestedRole);
        return { user, queuedForTeam: false };
    });
}

class InviteAlreadyUsed extends Error {}

/**
 * Personal parent invite: the club already chose the child, so the account is
 * active and linked in one go. Returns null when someone else used the invite
 * first — and then nothing of this signup is kept.
 */
export async function registerWithGuardianInvite(input: SignupIdentity & {
    phone: string;
    token: string;
    clubId: number;
}) {
    try {
        return await db.transaction(async (tx) => {
            const user = await upsertAccount(tx, input.existingUserId, {
                firebaseUid: input.firebaseUid,
                email: input.email,
                name: input.name,
                firstName: input.firstName,
                lastName: input.lastName,
                phone: input.phone,
                role: 'parent',
                status: 'active',
                clubId: input.clubId,
            });
            const redeemed = await redeemGuardianInvite(input.token, user.id, tx);
            if (!redeemed) throw new InviteAlreadyUsed();
            return { user, redeemed };
        });
    } catch (error) {
        if (error instanceof InviteAlreadyUsed) return null;
        throw error;
    }
}
