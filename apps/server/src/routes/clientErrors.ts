import express, { type Request, type Response } from 'express';
import { eq } from 'drizzle-orm';
import { db } from '../db';
import { users } from '../db/schema';
import { verifyBearerToken } from '../lib/clerkAuth';
import { clientIp, rateLimit } from '../middleware/rateLimit';
import { coarseUserAgent, createClientErrorDeduper, formatClientError, parseClientError } from '../lib/clientErrorReport';

/**
 * POST /api/client-errors — crashes seen in the browser (ErrorBoundary,
 * window.onerror, unhandledrejection; apps/client/services/errorReporter.ts).
 * Free stand-in for a paid error tracker: each distinct error is logged once
 * an hour as `[client-error]` in the Render logs; nothing is stored.
 *
 * No auth required — a crash can happen before sign-in. A Bearer token, when
 * sent and valid, only adds the caller's role to the line (never who it is).
 * Rate-limited per client IP (clientIp(): CF-Connecting-IP), body ≤ 8 kB,
 * every field clipped and scrubbed (lib/clientErrorReport.ts).
 */
const fresh = createClientErrorDeduper();

async function roleOf(req: Request): Promise<string | null> {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) return null;
    try {
        const identity = await verifyBearerToken(header.slice('Bearer '.length));
        const [row] = await db.select({ role: users.role }).from(users).where(eq(users.clerkUserId, identity.uid)).limit(1);
        return row?.role ?? 'unregistered';
    } catch {
        return null; // expired or bad token: still log the crash
    }
}

export const clientErrorRoute = [
    rateLimit({ bucket: 'client-errors', limit: 20, windowMs: 60_000, key: (req) => `ip:${clientIp(req)}` }),
    // text/plain too: navigator.sendBeacon can only send that without a preflight.
    express.json({ type: ['application/json', 'text/plain'], limit: '8kb' }),
    async (req: Request, res: Response) => {
        const report = parseClientError(req.body);
        if (!report) {
            res.status(400).json({ error: 'Raport invalid.' });
            return;
        }
        if (fresh(report)) {
            console.warn(formatClientError(report, { role: await roleOf(req), ua: coarseUserAgent(req.headers['user-agent']) }));
        }
        res.status(204).end();
    },
];
