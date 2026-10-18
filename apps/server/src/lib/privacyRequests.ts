import { toDate } from './dateUtils';

/**
 * GDPR requests (routes/privacy.ts). Art. 12(3): an answer is due within one
 * month; the app counts 30 days from the request, and shows who answered and
 * when. Pure, see privacyRequests.test.ts.
 */

export const PRIVACY_RESPONSE_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

export function privacyDueAt(createdAt: unknown): Date | null {
    const created = toDate(createdAt);
    return created ? new Date(created.getTime() + PRIVACY_RESPONSE_DAYS * DAY_MS) : null;
}

/** Whole days left until the deadline (negative once it passed); null without a date. */
export function privacyDaysLeft(createdAt: unknown, now = new Date()): number | null {
    const due = privacyDueAt(createdAt);
    if (!due) return null;
    return Math.ceil((due.getTime() - now.getTime()) / DAY_MS);
}

/** Where the people answering for a request open the list (email + in-app link). */
export function privacyRequestsPath(role: string | null | undefined) {
    return role === 'superadmin' ? '/super-admin/privacy' : '/admin/privacy';
}

export type ResolveInput = { note: string | null };

/** The "rezolvat" body: an optional note on what was done (≤ 1000 characters). */
export function parseResolveInput(body: unknown): { ok: true; value: ResolveInput } | { ok: false; error: string } {
    const raw = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
    if (raw.note != null && typeof raw.note !== 'string') return { ok: false, error: 'Nota trebuie să fie text.' };
    const note = String(raw.note ?? '').replace(/\s+/g, ' ').trim();
    if (note.length > 1000) return { ok: false, error: 'Nota are cel mult 1000 de caractere.' };
    return { ok: true, value: { note: note || null } };
}
