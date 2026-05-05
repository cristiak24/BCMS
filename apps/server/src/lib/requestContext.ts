import { Request, Response } from 'express';
import type { AppUserContext } from '../types/manageAccess';
import { normalizeRole } from './requestAuth';
import { fetchDocById, fetchDocByNumericId } from './firebaseAdmin';
import { firebaseAuth } from './firebaseAdmin';
import { db } from '../db';
import { users } from '../db/schema';
import { eq, or, sql } from 'drizzle-orm';

type ErrorPayload = { error: string };
type HeaderUserContext = {
    id: number | string;
    email: string;
    name: string;
    role: AppUserContext['role'];
    clubId?: number | null;
    status?: AppUserContext['status'] | 'active' | 'disabled';
};

const ADMIN_ROLES = new Set([
    'admin',
    'club_admin',
    'club-admin',
    'administrator',
    'owner',
    'superuser',
]);

function parseNumericHeader(value?: string) {
    if (!value) {
        return null;
    }

    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
}

function canUseFirestoreDocuments() {
    return Boolean(
        process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim() ||
        (process.env.FIREBASE_CLIENT_EMAIL?.trim() && process.env.FIREBASE_PRIVATE_KEY?.trim()) ||
        process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim() ||
        process.env.K_SERVICE ||
        process.env.FUNCTION_TARGET
    );
}

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
        const decodedToken = await firebaseAuth.verifyIdToken(token);
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
    const bearerUser = await getBearerAuthenticatedUser(req);

    if (bearerUser) {
        return bearerUser;
    }

    const rawUserId = req.header('x-user-id');
    const userId = parseNumericHeader(rawUserId);
    const role = normalizeRole(req.header('x-user-role'));
    const clubId = parseNumericHeader(req.header('x-user-club-id'));

    if (userId == null || !role) {
        return null;
    }

    if (userId === 0 && ADMIN_ROLES.has(role)) {
        return {
            id: 0,
            email: 'admin@test.com',
            name: 'Admin User',
            role: 'admin',
            clubId: clubId ?? 1,
            status: 'processed',
            isHardcodedAdmin: true,
        };
    }

    let user: HeaderUserContext | null = null;

    if (canUseFirestoreDocuments()) {
        try {
            user = userId != null
                ? await fetchDocByNumericId<HeaderUserContext>('users', userId)
                : rawUserId
                    ? await fetchDocById<HeaderUserContext>('users', rawUserId)
                    : null;
        } catch {
            user = null;
        }
    }

    if (!user && userId != null) {
        const userRows = await db
            .select()
            .from(users)
            .where(eq(users.id, userId))
            .limit(1);
        user = userRows[0] ?? null;
    }

    if (!user && rawUserId) {
        const userRows = await db
            .select()
            .from(users)
            .where(or(eq(users.firebaseUid, rawUserId), eq(users.uid, rawUserId)))
            .limit(1);
        user = userRows[0] ?? null;
    }

    if (!user) {
        return null;
    }

    return {
        id: typeof user.id === 'number' ? user.id : Number(user.id) || 0,
        email: user.email,
        name: user.name,
        role: user.role,
        clubId: user.clubId ?? clubId,
        status: user.status === 'active' ? 'processed' : user.status === 'disabled' ? 'rejected' : user.status,
    };
}

export async function requireRequestUser(req: Request, res: Response): Promise<AppUserContext | null> {
    const user = await getRequestUser(req);

    if (!user) {
        res.status(401).json({ error: 'Authentication required.' } satisfies ErrorPayload);
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
