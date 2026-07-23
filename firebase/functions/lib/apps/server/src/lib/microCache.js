"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.getOrCompute = getOrCompute;
exports.invalidate = invalidate;
exports.clearCache = clearCache;
const store = new Map();
const inflight = new Map();
/**
 * Return a cached value for `key`, or compute it with `fn` and cache it for
 * `ttlMs`. Concurrent callers for the same key share a single in-flight
 * computation (request coalescing) so we never run `fn` twice in parallel.
 */
async function getOrCompute(key, ttlMs, fn) {
    const now = Date.now();
    const cached = store.get(key);
    if (cached && cached.expiresAt > now) {
        return cached.value;
    }
    const existing = inflight.get(key);
    if (existing) {
        return existing;
    }
    const promise = (async () => {
        try {
            const value = await fn();
            store.set(key, { value, expiresAt: Date.now() + ttlMs });
            return value;
        }
        finally {
            inflight.delete(key);
        }
    })();
    inflight.set(key, promise);
    return promise;
}
/** Remove every cached entry whose key starts with `prefix`. */
function invalidate(prefix) {
    for (const key of store.keys()) {
        if (key.startsWith(prefix)) {
            store.delete(key);
        }
    }
}
/** Clear the whole cache (mainly for tests). */
function clearCache() {
    store.clear();
    inflight.clear();
}
