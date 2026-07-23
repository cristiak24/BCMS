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

/**
 * Encryption-at-rest for invite tokens.
 *
 * The token hash (irreversible) is what we authenticate against, but we also
 * keep the raw token so an admin can re-copy an active invite link. Storing that
 * in plaintext means a DB leak hands out working invite links. We therefore
 * encrypt it with AES-256-GCM using a key derived from INVITE_TOKEN_SECRET.
 *
 * Backward-compatible: if no secret is configured, or a stored value is not in
 * the encrypted envelope format, we treat it as plaintext. That keeps existing
 * rows working and never breaks the invite flow just because the env var is
 * missing (we only warn once).
 */
const ENC_PREFIX = 'enc:v1:';
let warnedMissingSecret = false;

function getEncryptionKey(): Buffer | null {
    const secret = process.env.INVITE_TOKEN_SECRET?.trim();
    if (!secret) {
        if (!warnedMissingSecret) {
            warnedMissingSecret = true;
            console.warn('[manageAccess] INVITE_TOKEN_SECRET not set — invite tokens are stored in plaintext.');
        }
        return null;
    }
    // Derive a stable 32-byte key from the secret.
    return crypto.createHash('sha256').update(secret).digest();
}

export function encryptInviteToken(rawToken: string): string {
    const key = getEncryptionKey();
    if (!key) {
        return rawToken;
    }

    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const encrypted = Buffer.concat([cipher.update(rawToken, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();

    return `${ENC_PREFIX}${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`;
}

export function decryptInviteToken(stored: string | null | undefined): string {
    if (!stored) {
        return '';
    }

    if (!stored.startsWith(ENC_PREFIX)) {
        // Legacy plaintext value.
        return stored;
    }

    const key = getEncryptionKey();
    if (!key) {
        return '';
    }

    try {
        const [ivHex, tagHex, dataHex] = stored.slice(ENC_PREFIX.length).split(':');
        const iv = Buffer.from(ivHex, 'hex');
        const tag = Buffer.from(tagHex, 'hex');
        const data = Buffer.from(dataHex, 'hex');

        const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
        decipher.setAuthTag(tag);
        const decrypted = Buffer.concat([decipher.update(data), decipher.final()]);
        return decrypted.toString('utf8');
    } catch (error) {
        console.error('[manageAccess] Failed to decrypt invite token:', error);
        return '';
    }
}

export function isInviteExpired(expiresAt: unknown) {
    const iso = toIso(expiresAt);
    return iso ? new Date(iso).getTime() <= Date.now() : true;
}
