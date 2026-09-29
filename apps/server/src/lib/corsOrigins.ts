/**
 * Browser origins allowed to call the API. Pure (env passed in) so it can be
 * unit-tested — see corsOrigins.test.ts.
 *
 * Production is an explicit allowlist: bcms.ro, whatever FRONTEND_URL /
 * APP_BASE_URL / FIREBASE_HOSTING_URL / CORS_ALLOWED_ORIGINS name, and the
 * project's own Firebase domains when GCLOUD_PROJECT is set. There used to be
 * a hostname-suffix rule accepting ANY *.web.app / *.firebaseapp.com site —
 * every Firebase-hosted page on the internet. Local development additionally
 * allows any localhost port.
 */
type Env = Record<string, string | undefined>;

export function normalizeAllowedOrigin(value?: string | null) {
    const trimmed = value?.trim().replace(/\/+$/, '');
    if (!trimmed) return null;

    try {
        return new URL(trimmed).origin;
    } catch {
        try {
            return new URL(`https://${trimmed}`).origin;
        } catch {
            return null;
        }
    }
}

export function createAllowedOrigins(env: Env) {
    const projectId = env.GCLOUD_PROJECT?.trim() || env.GOOGLE_CLOUD_PROJECT?.trim() || null;
    return new Set(
        [
            env.FRONTEND_URL,
            env.APP_BASE_URL,
            env.FIREBASE_HOSTING_URL,
            env.CORS_ALLOWED_ORIGINS,
            'https://bcms.ro',
            'https://www.bcms.ro',
            projectId ? `https://${projectId}.web.app` : null,
            projectId ? `https://${projectId}.firebaseapp.com` : null,
        ]
            .flatMap((value) => String(value ?? '').split(','))
            .map(normalizeAllowedOrigin)
            .filter((value): value is string => Boolean(value)),
    );
}

export function isOriginAllowed(origin: string, allowed: Set<string>, env: Env) {
    const normalized = normalizeAllowedOrigin(origin);
    if (normalized && allowed.has(normalized)) return true;

    if (env.NODE_ENV !== 'production') {
        try {
            const hostname = new URL(origin).hostname.toLowerCase();
            return ['localhost', '127.0.0.1', '[::1]', '::1'].includes(hostname);
        } catch {
            return false;
        }
    }

    return false;
}
