/**
 * An account waiting for the club's approval (users.status = 'pending': a
 * coach from a club code or access link, a parent/player from a team code, a
 * second parent awaiting the link) already carries its future role and club.
 * Until 2026-11 nothing on the server read that status, so an unapproved — or
 * denied, which leaves the account pending — coach read the roster, medical
 * visas, families' phones and staff documents as if approved
 * (AUDIT-SECURITY-2026-11 P0-1).
 *
 * A pending account may only use what concerns itself: its session and
 * signup, its own requests, invitations, its profile, its own GDPR rights,
 * a family invite link, and its own notifications. Everything else answers
 * 403 ACCOUNT_PENDING.
 */
const PENDING_ALLOWED: RegExp[] = [
    /^\/api\/auth(\/|$)/,
    /^\/api\/invitations(\/|$)/,
    /^\/api\/profile\/me(\/|$)/,
    /^\/api\/privacy\/(status|accept|export|erasure-request)\/?$/,
    /^\/api\/family\/(children|invites\/accept)\/?$/,
    /^\/api\/notifications(\/|$)/,
];

export const PENDING_ACCOUNT_ERROR = {
    error: 'Contul tău așteaptă aprobarea clubului.',
    code: 'ACCOUNT_PENDING',
} as const;

export function pendingAccountMayUse(originalUrl: string | undefined): boolean {
    const path = String(originalUrl ?? '').split('?')[0].replace(/\/{2,}/g, '/');
    return PENDING_ALLOWED.some((pattern) => pattern.test(path));
}
