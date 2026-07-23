import type { Response, NextFunction } from 'express';
import type { AuthenticatedRequest } from './auth';

/**
 * Best-effort in-memory sliding-window rate limiter.
 *
 * Keyed per authenticated user (falling back to client IP) + a caller-supplied
 * bucket name, so limits are isolated per sensitive action. Zero dependencies.
 *
 * Note: on serverless (Firebase Functions) counters live per warm instance, so
 * this is a guard against accidental hammering / simple abuse, not a hard global
 * quota. It must be layered on top of real authorization, never instead of it.
 */

type WindowState = {
    hits: number[]; // timestamps (ms) within the current window
};

const buckets = new Map<string, WindowState>();

// Periodically drop empty buckets so the map does not grow unbounded.
const SWEEP_INTERVAL_MS = 5 * 60 * 1000;
let lastSweep = Date.now();

function sweep(now: number, windowMs: number) {
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

function resolveIdentity(req: AuthenticatedRequest): string {
    const userId = req.user?.id;
    if (userId != null) {
        return `u:${userId}`;
    }
    return `ip:${req.ip ?? 'unknown'}`;
}

export type RateLimitOptions = {
    /** Unique bucket name for the protected action (e.g. "invite:generate"). */
    bucket: string;
    /** Max allowed requests within the window. */
    limit: number;
    /** Sliding window size in milliseconds. */
    windowMs: number;
};

export function rateLimit({ bucket, limit, windowMs }: RateLimitOptions) {
    return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
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
