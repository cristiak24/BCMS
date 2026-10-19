import express, { type Request, type Response } from 'express';
import { rateLimit } from '../middleware/rateLimit';
import { createViolationDeduper, parseCspReports } from '../lib/cspReport';

/**
 * POST /api/csp-report — where bcms.ro's Report-Only CSP sends violations
 * (`report-uri` in apps/client/public/_headers). No auth: browsers send these
 * on their own. Small, rate-limited, logged once per distinct violation;
 * nothing is stored. Read them in the Render logs ("[csp]") before the full
 * policy is enforced.
 */
const fresh = createViolationDeduper();

export const cspReportRoute = [
    rateLimit({ bucket: 'csp-report', limit: 60, windowMs: 60_000 }),
    express.json({ type: ['application/csp-report', 'application/reports+json', 'application/json'], limit: '16kb' }),
    (req: Request, res: Response) => {
        for (const violation of parseCspReports(req.body)) {
            if (fresh(violation)) console.warn(`[csp] ${violation.directive} blocked ${violation.blocked || '(none)'} on ${violation.page}`);
        }
        res.status(204).end();
    },
];
