import { createHash, createHmac, timingSafeEqual } from 'crypto';

/**
 * Club document library rules — pure, so the route stays thin and these stay tested.
 */

export const CLUB_DOCUMENT_MAX_BYTES = 5 * 1024 * 1024;
export const CLUB_DOCUMENT_CLUB_QUOTA_BYTES = 150 * 1024 * 1024;

export type DocumentVisibility = 'all' | 'staff';

/** Roles that run the club and may see "staff" documents. */
const STAFF_ROLES = new Set(['admin', 'superadmin', 'coach', 'staff', 'accountant']);
/** Roles that may add documents. */
const UPLOADER_ROLES = new Set(['admin', 'superadmin', 'coach']);

export function normalizeVisibility(value: unknown): DocumentVisibility {
    return value === 'staff' ? 'staff' : 'all';
}

export function canSeeDocument(role: string | null | undefined, visibility: string) {
    return visibility !== 'staff' || STAFF_ROLES.has(String(role ?? ''));
}

export function canUploadDocuments(role: string | null | undefined) {
    return UPLOADER_ROLES.has(String(role ?? ''));
}

/** Admins delete anything in their club; a coach only what they uploaded. */
export function canDeleteDocument(user: { id?: unknown; role?: unknown } | null | undefined, uploadedBy: number | null) {
    const role = String(user?.role ?? '');
    if (role === 'admin' || role === 'superadmin') return true;
    return role === 'coach' && uploadedBy != null && Number(user?.id) === uploadedBy;
}

/** A real PDF starts with "%PDF-" — the client's mime type alone proves nothing. */
export function looksLikePdf(buffer: Buffer | null | undefined) {
    return Boolean(buffer && buffer.length >= 5 && buffer.subarray(0, 5).toString('latin1') === '%PDF-');
}

export function cleanDocumentTitle(value: unknown, fallbackFileName: string) {
    const title = String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, 200);
    if (title) return title;
    return fallbackFileName.replace(/\.pdf$/i, '').replace(/[_-]+/g, ' ').trim().slice(0, 200) || 'Document';
}

/** Safe for a Content-Disposition header: ASCII fallback + RFC 5987 UTF-8 name. */
export function contentDisposition(fileName: string, disposition: 'inline' | 'attachment') {
    const ascii = fileName
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^\x20-\x7e]/g, '_')
        .replace(/["\\]/g, '_');
    return `${disposition}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}

/*
 * Short-lived signed links. Opening a PDF needs a URL the browser can load on
 * its own — a bearer-authenticated fetch + blob: URL does not survive the hop
 * from an installed iOS web app into Safari's PDF viewer. The token carries
 * the document, its club and an expiry, signed with HMAC-SHA256.
 */

export const DOCUMENT_LINK_TTL_MS = 5 * 60 * 1000;

/** Dedicated secret if configured, else one derived from the Clerk key (always set in prod). */
export function documentLinkSecret(env: NodeJS.ProcessEnv = process.env): Buffer | null {
    const base = env.DOCUMENT_LINK_SECRET?.trim() || env.CLERK_SECRET_KEY?.trim();
    return base ? createHash('sha256').update(`bcms:club-document-link:${base}`).digest() : null;
}

function sign(payload: string, secret: Buffer) {
    return createHmac('sha256', secret).update(payload).digest('base64url');
}

export function signDocumentLink(documentId: number, clubId: number, expiresAt: number, secret: Buffer) {
    const payload = `${documentId}.${clubId}.${expiresAt}`;
    return `${payload}.${sign(payload, secret)}`;
}

export function verifyDocumentLink(token: string, secret: Buffer, now = Date.now()) {
    const parts = String(token ?? '').split('.');
    if (parts.length !== 4) return null;
    const [id, club, exp, mac] = parts;
    const documentId = Number(id);
    const clubId = Number(club);
    const expiresAt = Number(exp);
    if (![documentId, clubId, expiresAt].every(Number.isSafeInteger)) return null;

    const expected = Buffer.from(sign(`${id}.${club}.${exp}`, secret));
    const given = Buffer.from(mac);
    if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
    if (expiresAt < now) return null;
    return { documentId, clubId };
}
