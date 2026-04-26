import type { Request } from 'express';

const ADMIN_ROLES = new Set([
    'admin',
    'club_admin',
    'club-admin',
    'administrator',
    'owner',
    'superuser',
]);

export function normalizeRole(role?: string | null) {
    return String(role ?? '').trim().toLowerCase();
}

export function getSessionUserId(req: Request) {
    const raw = req.header('x-user-id');
    if (!raw) {
        return null;
    }

    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : null;
}

export function isDemoAdmin(req: Request) {
    return req.header('x-user-id') === '0' || ADMIN_ROLES.has(normalizeRole(req.header('x-user-role')));
}
