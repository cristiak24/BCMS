import { Router } from 'express';
import { db } from '../db';
import { financialDocuments, financialSettings } from '../db/schema';
import { eq } from 'drizzle-orm';
import multer from 'multer';
import path from 'path';
import fs from 'fs';

const router = Router();

// Ensure uploads dir
const uploadDir = path.join(__dirname, '../../uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({ storage });

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

// POST /api/finance/upload
router.post('/upload', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            res.status(400).json({ error: 'No file uploaded' });
            return;
        }

        const { type, amount, description } = req.body;
        const documentUrl = `/uploads/${req.file.filename}`;

        const newDoc = await db.insert(financialDocuments).values({
            type: type || 'expense',
            amount: amount ? parseInt(amount, 10) : 0,
            description: description || 'New Document',
            documentUrl,
            status: 'pending'
        }).returning();

        res.json(newDoc[0]);
    } catch (error) {
        console.error('[POST /api/finance/upload] error:', error);
        res.status(500).json({ error: 'Failed to upload document' });
    }
});

// GET /api/finance/settings
router.get('/settings', async (req, res) => {
    try {
        let settings = await db.select().from(financialSettings).limit(1);
        if (settings.length === 0) {
            // Create default
            const newSettings = await db.insert(financialSettings).values({}).returning();
            res.json(newSettings[0]);
            return;
        }
        res.json(settings[0]);
    } catch (error) {
        console.error('[GET /api/finance/settings]', error);
        res.status(500).json({ error: 'Failed to load settings' });
    }
});

// PATCH /api/finance/settings
router.patch('/settings', async (req, res) => {
    try {
        const { monthlyPlayerFee, trainingLevy, facilityFee, autoAdjust } = req.body;
        
        // Ensure at least one row exists
        let settings = await db.select().from(financialSettings).limit(1);
        if (settings.length === 0) {
            settings = await db.insert(financialSettings).values({}).returning();
        }

        const updated = await db.update(financialSettings)
            .set({
                ...(monthlyPlayerFee !== undefined && { monthlyPlayerFee }),
                ...(trainingLevy !== undefined && { trainingLevy }),
                ...(facilityFee !== undefined && { facilityFee }),
                ...(autoAdjust !== undefined && { autoAdjust }),
                updatedAt: new Date()
            })
            .where(eq(financialSettings.id, settings[0].id))
            .returning();
            
        res.json(updated[0]);
    } catch (error) {
        console.error('[PATCH /api/finance/settings]', error);
        res.status(500).json({ error: 'Failed to update settings' });
    }
});

export default router;
