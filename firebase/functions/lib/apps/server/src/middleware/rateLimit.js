"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.rateLimit = rateLimit;
const buckets = new Map();
// Periodically drop empty buckets so the map does not grow unbounded.
const SWEEP_INTERVAL_MS = 5 * 60 * 1000;
let lastSweep = Date.now();
function sweep(now, windowMs) {
    if (now - lastSweep < SWEEP_INTERVAL_MS) {
        return;
    }
    lastSweep = now;
    for (const [key, state] of buckets) {
        if (state.hits.length === 0 || now - state.hits[state.hits.length - 1] > windowMs) {
            buckets.delete(key);
        }
    }
}
function resolveIdentity(req) {
    const userId = req.user?.id;
    if (userId != null) {
        return `u:${userId}`;
    }
    return `ip:${req.ip ?? 'unknown'}`;
}
function rateLimit({ bucket, limit, windowMs }) {
    return (req, res, next) => {
        const now = Date.now();
        sweep(now, windowMs);
        const key = `${bucket}|${resolveIdentity(req)}`;
        const state = buckets.get(key) ?? { hits: [] };
        // Drop timestamps that fell out of the sliding window.
        const windowStart = now - windowMs;
        state.hits = state.hits.filter((ts) => ts > windowStart);
        if (state.hits.length >= limit) {
            const oldest = state.hits[0];
            const retryAfterSec = Math.max(1, Math.ceil((oldest + windowMs - now) / 1000));
            res.setHeader('Retry-After', String(retryAfterSec));
            buckets.set(key, state);
            return res.status(429).json({
                error: 'Too many requests. Please slow down and try again shortly.',
                retryAfterSeconds: retryAfterSec,
            });
        }
        state.hits.push(now);
        buckets.set(key, state);
        return next();
    };
}
