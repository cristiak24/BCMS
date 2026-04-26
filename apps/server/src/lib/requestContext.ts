import { Request, Response } from 'express';
import type { AppUserContext } from '../types/manageAccess';
import { normalizeRole } from './requestAuth';
import { fetchDocById, fetchDocByNumericId } from './firebaseAdmin';

type ErrorPayload = { error: string };

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

export async function getRequestUser(req: Request): Promise<AppUserContext | null> {
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

    const user = userId != null
        ? await fetchDocByNumericId<{
            email: string;
            name: string;
            role: AppUserContext['role'];
            clubId?: number | null;
            status?: AppUserContext['status'];
        }>('users', userId)
        : rawUserId
            ? await fetchDocById<{
                email: string;
                name: string;
                role: AppUserContext['role'];
                clubId?: number | null;
                status?: AppUserContext['status'];
                id?: number;
            }>('users', rawUserId)
            : null;

    if (!user) {
        return null;
    }

    return {
        id: typeof user.id === 'number' ? user.id : Number(user.id) || 0,
        email: user.email,
        name: user.name,
        role: user.role,
        clubId: user.clubId ?? clubId,
        status: user.status,
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

    if (normalizeRole(user.role) !== 'admin' || user.clubId == null) {
        res.status(403).json({ error: 'Club admin access is required.' } satisfies ErrorPayload);
        return null;
    }

    return user;
}
