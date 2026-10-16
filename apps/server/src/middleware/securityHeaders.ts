import type { NextFunction, Request, Response } from 'express';

/**
 * Security headers for the API — what `helmet()` sets, minus what would break
 * this API (kept dependency-free):
 *  - no Cross-Origin-Resource-Policy: bcms.ro shows avatars and documents
 *    served from this origin (routes/files.ts sets its own);
 *  - the CSP, which only makes sense for JSON, is skipped for /api/files,
 *    which serves PDFs and images inline (a `default-src 'none'` document
 *    policy breaks the browser's PDF viewer).
 */
const ALWAYS: Record<string, string> = {
    'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'X-DNS-Prefetch-Control': 'off',
    'X-Download-Options': 'noopen',
    'X-Permitted-Cross-Domain-Policies': 'none',
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Origin-Agent-Cluster': '?1',
};

const API_DOCUMENT_POLICY = "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'";

export function securityHeaders(req: Request, res: Response, next: NextFunction) {
    for (const [name, value] of Object.entries(ALWAYS)) res.setHeader(name, value);
    if (!req.path.startsWith('/api/files/')) {
        res.setHeader('Content-Security-Policy', API_DOCUMENT_POLICY);
        res.setHeader('X-Frame-Options', 'DENY');
    }
    next();
}
