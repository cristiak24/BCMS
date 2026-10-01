import crypto from 'crypto';
import { eq } from 'drizzle-orm';
import type { Request } from 'express';
import { db } from '../db';
import { storedFiles } from '../db/schema';
import { documentLinkSecret } from './clubDocuments';

/**
 * Files kept in Postgres instead of the API host's disk (which Render wipes on
 * every deploy). Public files (avatars) are served by an unguessable 128-bit
 * key; private ones (finance documents) only with a short-lived HMAC
 * signature. See routes/files.ts.
 */

export const FILE_LINK_TTL_MS = 5 * 60 * 1000;

/** What the bytes actually are — the client's mime type and file name prove nothing. */
export function sniffMime(buffer: Buffer | null | undefined): string | null {
    if (!buffer || buffer.length < 12) return null;
    if (buffer.subarray(0, 5).toString('latin1') === '%PDF-') return 'application/pdf';
    if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg';
    if (buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
    if (buffer.subarray(0, 4).toString('latin1') === 'RIFF' && buffer.subarray(8, 12).toString('latin1') === 'WEBP') return 'image/webp';
    return null;
}

export function isFileKey(value: string) {
    return /^[a-f0-9]{32}$/.test(value);
}

export async function saveStoredFile(params: {
    buffer: Buffer;
    mimeType: string;
    fileName: string;
    kind: 'avatar' | 'finance_doc';
    isPublic: boolean;
    clubId: number | null;
    uploadedBy: number | null;
}) {
    const key = crypto.randomBytes(16).toString('hex');
    await db.insert(storedFiles).values({
        key,
        clubId: params.clubId,
        uploadedBy: params.uploadedBy,
        kind: params.kind,
        isPublic: params.isPublic,
        fileName: params.fileName.slice(0, 255) || 'fisier',
        mimeType: params.mimeType,
        sizeBytes: params.buffer.length,
        data: params.buffer,
    });
    return key;
}

/** The stored-file key in a URL we issued ("…/api/files/<key>"), else null. */
export function fileKeyFromUrl(url: string | null | undefined) {
    const match = String(url ?? '').match(/\/api\/files\/([a-f0-9]{32})(?:[?#/]|$)/);
    return match ? match[1] : null;
}

export async function deleteStoredFile(key: string | null) {
    if (key) await db.delete(storedFiles).where(eq(storedFiles.key, key));
}

/**
 * Absolute URL of this API for links stored in the DB and rendered by another
 * origin (the web app). Behind Render's proxy the scheme and host come from
 * the forwarded headers.
 */
export function apiOrigin(req: Pick<Request, 'get' | 'protocol'>) {
    const proto = req.get('x-forwarded-proto')?.split(',')[0]?.trim() || req.protocol || 'https';
    const host = req.get('x-forwarded-host')?.split(',')[0]?.trim() || req.get('host');
    return `${proto}://${host}`;
}

function sign(payload: string, secret: Buffer) {
    return crypto.createHmac('sha256', secret).update(payload).digest('base64url');
}

export function signFileQuery(key: string, expiresAt: number, secret: Buffer) {
    return `exp=${expiresAt}&sig=${sign(`file:${key}.${expiresAt}`, secret)}`;
}

export function verifyFileSignature(key: string, exp: unknown, sig: unknown, secret: Buffer, now = Date.now()) {
    const expiresAt = Number(exp);
    if (!Number.isSafeInteger(expiresAt) || expiresAt < now || typeof sig !== 'string') return false;
    const expected = Buffer.from(sign(`file:${key}.${expiresAt}`, secret));
    const given = Buffer.from(sig);
    return expected.length === given.length && crypto.timingSafeEqual(expected, given);
}

export { documentLinkSecret as fileLinkSecret };
