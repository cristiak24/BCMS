import crypto from 'crypto';
import type { InviteRole } from '../types/manageAccess';
import { toIso } from './firebaseAdmin';

export type InviteTokenPayload = {
    rawToken: string;
    tokenHash: string;
    role: InviteRole;
    expiresAt: Date;
};

export function normalizeRefreshIntervalMinutes(input?: number) {
    const minutes = Number.isFinite(input) ? Math.floor(Number(input)) : 30;

    if (minutes < 5) {
        return 5;
    }

    if (minutes > 24 * 60) {
        return 24 * 60;
    }

    return minutes;
}

export function generateInviteToken(role: InviteRole, refreshIntervalMinutes = 30): InviteTokenPayload {
    const interval = normalizeRefreshIntervalMinutes(refreshIntervalMinutes);
    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = hashInviteToken(rawToken);
    const expiresAt = new Date(Date.now() + interval * 60 * 1000);

    return {
        rawToken,
        tokenHash,
        role,
        expiresAt,
    };
}

export function hashInviteToken(rawToken: string) {
    return crypto.createHash('sha256').update(rawToken).digest('hex');
}

export function isInviteExpired(expiresAt: unknown) {
    const iso = toIso(expiresAt);
    return iso ? new Date(iso).getTime() <= Date.now() : true;
}
