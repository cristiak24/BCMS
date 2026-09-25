import { Request, Response } from 'express';
import type { AppUserContext } from '../types/manageAccess';
import { normalizeRole } from './requestAuth';
import { verifyBearerToken } from './clerkAuth';
import { db } from '../db';
import { users } from '../db/schema';
import { eq, or, sql } from 'drizzle-orm';

type ErrorPayload = { error: string };

/**
 * Resolve the caller from their Clerk session token.
 *
 * This is the ONLY accepted proof of identity. An earlier revision also trusted
 * `x-user-id` / `x-user-role` / `x-user-club-id` request headers as a fallback,
 * which let any unauthenticated caller impersonate an arbitrary user (or mint a
 * hardcoded admin with `x-user-id: 0`) simply by setting a header. Those headers
 * are now ignored everywhere.
 */
async function getBearerAuthenticatedUser(req: Request): Promise<AppUserContext | null> {
    const authHeader = req.header('authorization');

    if (!authHeader?.startsWith('Bearer ')) {
        return null;
    }

    const token = authHeader.slice('Bearer '.length).trim();

    if (!token) {
        return null;
    }

    try {
        const decodedToken = await verifyBearerToken(token);
        let userRows = await db
            .select()
            .from(users)
            .where(or(
                eq(users.firebaseUid, decodedToken.uid),
                eq(users.uid, decodedToken.uid),
            ))
            .limit(1);

        if (userRows.length === 0 && decodedToken.email) {
            const email = decodedToken.email.trim().toLowerCase();
            const emailRows = await db
                .select()
                .from(users)
                .where(sql`lower(${users.email}) = ${email}`)
                .limit(1);

            if (emailRows[0]) {
                userRows = await db
                    .update(users)
                    .set({
                        firebaseUid: decodedToken.uid,
                        updatedAt: new Date().toISOString(),
                    })
                    .where(eq(users.id, emailRows[0].id))
                    .returning();
            }
        }

        const user = userRows[0];
        if (!user) {
            return null;
        }

        return {
            id: user.id,
            email: user.email,
            name: user.name,
            role: user.role as AppUserContext['role'],
            clubId: user.clubId ?? null,
            status: user.status === 'pending'
                ? 'pending'
                : user.status === 'disabled'
                    ? 'rejected'
                    : 'processed',
        };
    } catch {
        return null;
    }
}

export async function getRequestUser(req: Request): Promise<AppUserContext | null> {
    return getBearerAuthenticatedUser(req);
}

export async function requireRequestUser(req: Request, res: Response): Promise<AppUserContext | null> {
    const user = await getRequestUser(req);

    if (!user) {
        res.status(401).json({ error: 'Authentication required.' } satisfies ErrorPayload);
        return null;
    }

    if (user.status === 'rejected') {
        res.status(403).json({ error: 'This account has been disabled.' } satisfies ErrorPayload);
        return null;
    }

    return user;
}

export async function requireClubAdmin(req: Request, res: Response): Promise<AppUserContext | null> {
    const user = await requireRequestUser(req, res);

    if (!user) {
        return null;
    }

    const normalizedRole = normalizeRole(user.role);

    if (normalizedRole === 'superadmin') {
        return user;
    }

    if (normalizedRole !== 'admin' || user.clubId == null) {
        res.status(403).json({ error: 'Club admin access is required.' } satisfies ErrorPayload);
        return null;
    }

    return user;
}
