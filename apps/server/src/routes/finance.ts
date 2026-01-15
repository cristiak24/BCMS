import { Router } from 'express';
import { db } from '../db';
import { financialDocuments } from '../db/schema';
import { eq } from 'drizzle-orm';

const router = Router();

// GET /api/finance/documents
router.get('/documents', async (req, res) => {
    try {
        const docs = await db.select().from(financialDocuments);
        res.json(docs);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to fetch documents' });
    }
});

// PATCH /api/finance/documents/:id/status
router.patch('/documents/:id/status', async (req, res) => {
    const { id } = req.params;
    const { status } = req.body;

    if (!status || !['pending', 'processed', 'rejected'].includes(status)) {
        res.status(400).json({ error: 'Invalid status' });
        return;
    }

    try {
        const updated = await db
            .update(financialDocuments)
            .set({ status })
            .where(eq(financialDocuments.id, Number(id)))
            .returning();

        if (updated.length === 0) {
            res.status(404).json({ error: 'Document not found' });
            return;
        }

        res.json(updated[0]);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to update document status' });
    }
});

export default router;
