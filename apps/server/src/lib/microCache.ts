/**
 * Tiny in-memory TTL cache with prefix invalidation.
 *
 * Purpose: coalesce short bursts of identical, read-heavy work (e.g. the club
 * admin accounts listing that runs invitation sync + several queries on every
 * request). Values are stored per-process, so on serverless (Firebase
 * Functions) this is best-effort per instance — good enough to smooth out a
 * user hammering "Refresh", and safe because we invalidate on every mutation.
 *
 * Zero dependencies by design.
 */

type CacheEntry<T> = {
    value: T;
    expiresAt: number;
};

const store = new Map<string, CacheEntry<unknown>>();
const inflight = new Map<string, Promise<unknown>>();

/**
 * Expired entries used to stay until the same key was written again, so a
 * long-lived process kept every key it ever cached (one per signed-in Clerk
 * user, per club listing…). A sweep drops them; unref'd so it never keeps the
 * process (or a test run) alive.
 */
const SWEEP_INTERVAL_MS = 60_000;
let sweepTimer: ReturnType<typeof setInterval> | null = null;

/** Drop every entry that expired by `now`; returns how many went. */
export function sweepExpired(now = Date.now()): number {
    let removed = 0;
    for (const [key, entry] of store) {
        if (entry.expiresAt <= now) {
            store.delete(key);
            removed += 1;
        }
    }
    return removed;
}

function ensureSweep() {
    if (sweepTimer) return;
    sweepTimer = setInterval(() => sweepExpired(), SWEEP_INTERVAL_MS);
    sweepTimer.unref?.();
}

/**
 * Return a cached value for `key`, or compute it with `fn` and cache it for
 * `ttlMs`. Concurrent callers for the same key share a single in-flight
 * computation (request coalescing) so we never run `fn` twice in parallel.
 */
export async function getOrCompute<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
    const now = Date.now();
    const cached = store.get(key);

    if (cached && cached.expiresAt > now) {
        return cached.value as T;
    }

    const existing = inflight.get(key);
    if (existing) {
        return existing as Promise<T>;
    }

    const promise = (async () => {
        try {
            const value = await fn();
            store.set(key, { value, expiresAt: Date.now() + ttlMs });
            ensureSweep();
            return value;
        } finally {
            inflight.delete(key);
        }
    })();

    inflight.set(key, promise);
    return promise as Promise<T>;
}

/** Remove every cached entry whose key starts with `prefix`. */
export function invalidate(prefix: string): void {
    for (const key of store.keys()) {
        if (key.startsWith(prefix)) {
            store.delete(key);
        }
    }
}

/** Clear the whole cache (mainly for tests). */
export function clearCache(): void {
    store.clear();
    inflight.clear();
}

/** Entries held right now, expired or not (tests). */
export function cacheSize(): number {
    return store.size;
}
