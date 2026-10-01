import { Router, type Response } from 'express';
import multer from 'multer';
import { and, desc, eq, sql } from 'drizzle-orm';
import { authenticate, type AuthenticatedRequest } from '../middleware/auth';
import { rateLimit } from '../middleware/rateLimit';
import { db } from '../db';
import { clubDocuments, users } from '../db/schema';
import { resolveRequestClubId } from '../lib/tenantScope';
import { toIso } from '../lib/dateUtils';
import {
    CLUB_DOCUMENT_CLUB_QUOTA_BYTES,
    CLUB_DOCUMENT_MAX_BYTES,
    canDeleteDocument,
    canSeeDocument,
    canUploadDocuments,
    cleanDocumentTitle,
    contentDisposition,
    DOCUMENT_LINK_TTL_MS,
    documentLinkSecret,
    looksLikePdf,
    normalizeVisibility,
    signDocumentLink,
    verifyDocumentLink,
} from '../lib/clubDocuments';

/**
 * Club document library — small PDFs every member (or only staff) can read.
 *
 *   GET    /api/club-documents           → list (no file bytes)
 *   POST   /api/club-documents           → multipart: file (PDF ≤ 5 MB), title, visibility
 *   GET    /api/club-documents/:id/file  → the PDF
 *   POST   /api/club-documents/:id/link  → a signed URL valid 5 minutes
 *   GET    /api/club-documents/shared/:token → the PDF, no bearer needed (for opening in a new tab)
 *   DELETE /api/club-documents/:id
 *
 * Every query is scoped to the caller's own club. A document of another club
 * answers 404, same as one that does not exist.
 */

const router = Router();

async function sendDocument(res: Response, doc: typeof clubDocuments.$inferSelect, download: boolean) {
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Length', String(doc.data.length));
    res.setHeader('Content-Disposition', contentDisposition(doc.fileName, download ? 'attachment' : 'inline'));
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.end(doc.data);
}

// Before `authenticate`: the signed token IS the credential here.
router.get('/shared/:token', async (req, res) => {
    try {
        const secret = documentLinkSecret();
        const claim = secret ? verifyDocumentLink(String(req.params.token), secret) : null;
        if (!claim) {
            res.status(410).type('text/plain; charset=utf-8').send('Linkul a expirat. Deschide documentul din nou din aplicație.');
            return;
        }
        const rows = await db.select().from(clubDocuments)
            .where(and(eq(clubDocuments.id, claim.documentId), eq(clubDocuments.clubId, claim.clubId)))
            .limit(1);
        if (!rows[0]) {
            res.status(404).type('text/plain; charset=utf-8').send('Documentul nu mai există.');
            return;
        }
        await sendDocument(res, rows[0], req.query.download === '1');
    } catch (error) {
        console.error('[club-documents:shared] error:', error);
        res.status(500).type('text/plain; charset=utf-8').send('Nu am putut deschide documentul.');
    }
});

router.use(authenticate);

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: CLUB_DOCUMENT_MAX_BYTES, files: 1, fields: 5 },
});

const listColumns = {
    id: clubDocuments.id,
    title: clubDocuments.title,
    fileName: clubDocuments.fileName,
    sizeBytes: clubDocuments.sizeBytes,
    visibility: clubDocuments.visibility,
    uploadedBy: clubDocuments.uploadedBy,
    createdAt: clubDocuments.createdAt,
};

function requireClub(req: AuthenticatedRequest) {
    if (!req.user) return null;
    return resolveRequestClubId(req.user);
}

router.get('/', async (req: AuthenticatedRequest, res) => {
    try {
        const clubId = requireClub(req);
        if (clubId == null) {
            res.json({ documents: [], canUpload: false, usedBytes: 0, quotaBytes: CLUB_DOCUMENT_CLUB_QUOTA_BYTES, maxFileBytes: CLUB_DOCUMENT_MAX_BYTES });
            return;
        }
        const role = req.user?.role;
        const rows = await db
            .select({ ...listColumns, uploaderName: users.name })
            .from(clubDocuments)
            .leftJoin(users, eq(users.id, clubDocuments.uploadedBy))
            .where(eq(clubDocuments.clubId, clubId))
            .orderBy(desc(clubDocuments.createdAt));

        const usedBytes = rows.reduce((sum, row) => sum + row.sizeBytes, 0);
        res.json({
            documents: rows
                .filter((row) => canSeeDocument(role, row.visibility))
                .map((row) => ({
                    id: row.id,
                    title: row.title,
                    fileName: row.fileName,
                    sizeBytes: row.sizeBytes,
                    visibility: row.visibility,
                    uploaderName: row.uploaderName ?? null,
                    createdAt: toIso(row.createdAt),
                    canDelete: canDeleteDocument(req.user, row.uploadedBy),
                })),
            canUpload: canUploadDocuments(role),
            usedBytes,
            quotaBytes: CLUB_DOCUMENT_CLUB_QUOTA_BYTES,
            maxFileBytes: CLUB_DOCUMENT_MAX_BYTES,
        });
    } catch (error) {
        console.error('[club-documents:list] error:', error);
        res.status(500).json({ error: 'Nu am putut încărca documentele.' });
    }
});

router.post(
    '/',
    rateLimit({ bucket: 'club-documents:upload', limit: 20, windowMs: 10 * 60_000 }),
    (req, res, next) => {
        upload.single('file')(req, res, (error) => {
            if (error) {
                const tooBig = error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE';
                res.status(400).json({ error: tooBig ? 'Fișierul depășește 5 MB.' : 'Fișier invalid.' });
                return;
            }
            next();
        });
    },
    async (req: AuthenticatedRequest, res) => {
        try {
            const clubId = requireClub(req);
            if (clubId == null || !canUploadDocuments(req.user?.role)) {
                res.status(403).json({ error: 'Doar adminii și antrenorii pot încărca documente.' });
                return;
            }
            const file = req.file;
            if (!file) {
                res.status(400).json({ error: 'Alege un fișier PDF.' });
                return;
            }
            if (!looksLikePdf(file.buffer)) {
                res.status(400).json({ error: 'Sunt acceptate doar fișiere PDF.' });
                return;
            }

            const [{ used }] = await db
                .select({ used: sql<number>`coalesce(sum(${clubDocuments.sizeBytes}), 0)::int` })
                .from(clubDocuments)
                .where(eq(clubDocuments.clubId, clubId));
            if (Number(used) + file.size > CLUB_DOCUMENT_CLUB_QUOTA_BYTES) {
                res.status(400).json({ error: 'Spațiul pentru documente al clubului (150 MB) este plin. Șterge documente vechi.' });
                return;
            }

            // Multer hands the original name over as latin1; recover UTF-8 (ș, ț…).
            const fileName = Buffer.from(file.originalname, 'latin1').toString('utf8').slice(0, 255) || 'document.pdf';
            const [row] = await db.insert(clubDocuments).values({
                clubId,
                title: cleanDocumentTitle(req.body?.title, fileName),
                fileName,
                mimeType: 'application/pdf',
                sizeBytes: file.size,
                data: file.buffer,
                visibility: normalizeVisibility(req.body?.visibility),
                uploadedBy: req.user?.id ?? null,
            }).returning(listColumns);

            res.status(201).json({
                ...row,
                createdAt: toIso(row.createdAt),
                uploaderName: req.user?.name ?? null,
                canDelete: true,
            });
        } catch (error) {
            console.error('[club-documents:upload] error:', error);
            res.status(500).json({ error: 'Încărcarea a eșuat.' });
        }
    },
);

router.get('/:id/file', async (req: AuthenticatedRequest, res) => {
    try {
        const clubId = requireClub(req);
        const id = Number(req.params.id);
        if (clubId == null || !Number.isInteger(id)) {
            res.status(404).json({ error: 'Documentul nu există.' });
            return;
        }
        const rows = await db.select().from(clubDocuments)
            .where(and(eq(clubDocuments.id, id), eq(clubDocuments.clubId, clubId)))
            .limit(1);
        const doc = rows[0];
        if (!doc || !canSeeDocument(req.user?.role, doc.visibility)) {
            res.status(404).json({ error: 'Documentul nu există.' });
            return;
        }
        await sendDocument(res, doc, req.query.download === '1');
    } catch (error) {
        console.error('[club-documents:file] error:', error);
        res.status(500).json({ error: 'Nu am putut deschide documentul.' });
    }
});

router.post('/:id/link', async (req: AuthenticatedRequest, res) => {
    try {
        const clubId = requireClub(req);
        const id = Number(req.params.id);
        const secret = documentLinkSecret();
        if (!secret) {
            res.status(503).json({ error: 'Linkurile de document nu sunt configurate.' });
            return;
        }
        if (clubId == null || !Number.isInteger(id)) {
            res.status(404).json({ error: 'Documentul nu există.' });
            return;
        }
        const rows = await db.select({ id: clubDocuments.id, visibility: clubDocuments.visibility })
            .from(clubDocuments)
            .where(and(eq(clubDocuments.id, id), eq(clubDocuments.clubId, clubId)))
            .limit(1);
        if (!rows[0] || !canSeeDocument(req.user?.role, rows[0].visibility)) {
            res.status(404).json({ error: 'Documentul nu există.' });
            return;
        }
        const expiresAt = Date.now() + DOCUMENT_LINK_TTL_MS;
        res.json({ path: `/club-documents/shared/${signDocumentLink(id, clubId, expiresAt, secret)}`, expiresAt });
    } catch (error) {
        console.error('[club-documents:link] error:', error);
        res.status(500).json({ error: 'Nu am putut deschide documentul.' });
    }
});

router.delete('/:id', async (req: AuthenticatedRequest, res) => {
    try {
        const clubId = requireClub(req);
        const id = Number(req.params.id);
        if (clubId == null || !Number.isInteger(id)) {
            res.status(404).json({ error: 'Documentul nu există.' });
            return;
        }
        const rows = await db.select({ id: clubDocuments.id, uploadedBy: clubDocuments.uploadedBy })
            .from(clubDocuments)
            .where(and(eq(clubDocuments.id, id), eq(clubDocuments.clubId, clubId)))
            .limit(1);
        if (!rows[0]) {
            res.status(404).json({ error: 'Documentul nu există.' });
            return;
        }
        if (!canDeleteDocument(req.user, rows[0].uploadedBy)) {
            res.status(403).json({ error: 'Nu poți șterge acest document.' });
            return;
        }
        await db.delete(clubDocuments).where(eq(clubDocuments.id, id));
        res.status(204).end();
    } catch (error) {
        console.error('[club-documents:delete] error:', error);
        res.status(500).json({ error: 'Nu am putut șterge documentul.' });
    }
});

export default router;
