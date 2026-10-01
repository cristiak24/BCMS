import { Router } from 'express';
import { eq } from 'drizzle-orm';
import { authenticate, type AuthenticatedRequest } from '../middleware/auth';
import { db } from '../db';
import { storedFiles } from '../db/schema';
import { contentDisposition } from '../lib/clubDocuments';
import { FILE_LINK_TTL_MS, fileLinkSecret, isFileKey, signFileQuery, verifyFileSignature } from '../lib/storedFiles';

/**
 *   GET  /api/files/:key                → public files (avatars) as-is; private
 *                                         ones only with ?exp=…&sig=… (5 minutes)
 *   POST /api/files/:key/link   (auth)  → a signed path for a private file of the
 *                                         caller's club (finance: admin/accountant)
 */

const router = Router();

const FINANCE_ROLES = new Set(['admin', 'accountant', 'superadmin']);

router.get('/:key', async (req, res) => {
    try {
        const key = String(req.params.key);
        if (!isFileKey(key)) {
            res.status(404).end();
            return;
        }
        const [file] = await db.select().from(storedFiles).where(eq(storedFiles.key, key)).limit(1);
        if (!file) {
            res.status(404).end();
            return;
        }
        if (!file.isPublic) {
            const secret = fileLinkSecret();
            if (!secret || !verifyFileSignature(key, req.query.exp, req.query.sig, secret)) {
                res.status(410).type('text/plain; charset=utf-8').send('Linkul a expirat. Deschide fișierul din nou din aplicație.');
                return;
            }
        }
        res.setHeader('Content-Type', file.mimeType);
        res.setHeader('Content-Length', String(file.data.length));
        res.setHeader('Content-Disposition', contentDisposition(file.fileName, req.query.download === '1' ? 'attachment' : 'inline'));
        res.setHeader('X-Content-Type-Options', 'nosniff');
        // Public keys never change content (a new avatar gets a new key), so cache hard.
        res.setHeader('Cache-Control', file.isPublic ? 'public, max-age=31536000, immutable' : 'private, no-store');
        // Images/PDFs are embedded by the web app on another origin.
        res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
        res.end(file.data);
    } catch (error) {
        console.error('[files:get] error:', error);
        res.status(500).end();
    }
});

router.post('/:key/link', authenticate, async (req: AuthenticatedRequest, res) => {
    try {
        const key = String(req.params.key);
        const secret = fileLinkSecret();
        if (!isFileKey(key) || !secret) {
            res.status(404).json({ error: 'Fișierul nu există.' });
            return;
        }
        const [file] = await db.select({ clubId: storedFiles.clubId, kind: storedFiles.kind, isPublic: storedFiles.isPublic })
            .from(storedFiles).where(eq(storedFiles.key, key)).limit(1);
        const role = String(req.user?.role ?? '');
        const sameClub = file && (role === 'superadmin' || (file.clubId != null && Number(req.user?.clubId) === file.clubId));
        const allowed = file && sameClub && (file.isPublic || (file.kind === 'finance_doc' && FINANCE_ROLES.has(role)));
        if (!allowed) {
            res.status(404).json({ error: 'Fișierul nu există.' });
            return;
        }
        const query = file.isPublic ? '' : `?${signFileQuery(key, Date.now() + FILE_LINK_TTL_MS, secret)}`;
        res.json({ path: `/api/files/${key}${query}` });
    } catch (error) {
        console.error('[files:link] error:', error);
        res.status(500).json({ error: 'Nu am putut deschide fișierul.' });
    }
});

export default router;
