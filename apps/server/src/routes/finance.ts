import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { admin, firestore, nextNumericId, toIso } from '../lib/firebaseAdmin';

const router = Router();

const uploadDir = path.join(__dirname, '../../uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadDir),
    filename: (_req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({ storage });

router.get('/documents', async (_req, res) => {
    try {
        const snap = await firestore.collection('financialDocuments').orderBy('date', 'desc').get();
        const docs = snap.docs.map((docSnap) => {
            const data = docSnap.data() as {
                id: number;
                type: string;
                amount: number;
                description: string;
                date?: FirebaseFirestore.Timestamp | Date | string | null;
                documentUrl?: string | null;
                status: 'pending' | 'processed' | 'rejected';
            };

            return {
                ...data,
                date: toIso(data.date) ?? new Date().toISOString(),
            };
        });
        res.json(docs);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to fetch documents' });
    }
});

router.patch('/documents/:id/status', async (req, res) => {
    const id = Number(req.params.id);
    const { status } = req.body as { status?: string };

    if (!status || !['pending', 'processed', 'rejected'].includes(status)) {
        res.status(400).json({ error: 'Invalid status' });
        return;
    }

    try {
        const snap = await firestore.collection('financialDocuments').where('id', '==', id).limit(1).get();
        const docSnap = snap.docs[0];
        if (!docSnap) {
            res.status(404).json({ error: 'Document not found' });
            return;
        }

        await docSnap.ref.set({ status }, { merge: true });
        const updated = await docSnap.ref.get();
        res.json({
            ...(updated.data() as Record<string, unknown>),
            date: toIso((updated.data() as { date?: unknown }).date) ?? null,
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to update document status' });
    }
});

router.post('/upload', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            res.status(400).json({ error: 'No file uploaded' });
            return;
        }

        const { type, amount, description } = req.body;
        const documentUrl = `/uploads/${req.file.filename}`;
        const id = await nextNumericId('financialDocuments');
        const record = {
            id,
            type: type || 'expense',
            amount: amount ? parseInt(amount, 10) : 0,
            description: description || 'New Document',
            documentUrl,
            status: 'pending',
            date: new Date(),
        };

        await firestore.collection('financialDocuments').doc(String(id)).set(record);

        res.json({
            ...record,
            date: new Date().toISOString(),
        });
    } catch (error) {
        console.error('[POST /api/finance/upload] error:', error);
        res.status(500).json({ error: 'Failed to upload document' });
    }
});

async function ensureSettings() {
    const ref = firestore.collection('financialSettings').doc('1');
    const snap = await ref.get();

    if (snap.exists) {
        return snap;
    }

        await ref.set({
            id: 1,
            monthlyPlayerFee: 0,
            trainingLevy: 0,
            facilityFee: 0,
            autoAdjust: 1,
            updatedAt: new Date(),
        });

    return ref.get();
}

router.get('/settings', async (_req, res) => {
    try {
        const snap = await ensureSettings();
        const data = snap.data() as {
            id: number;
            monthlyPlayerFee: number;
            trainingLevy: number;
            facilityFee: number;
            autoAdjust: number;
            updatedAt?: FirebaseFirestore.Timestamp | Date | string | null;
        };

        res.json({
            ...data,
            updatedAt: toIso(data.updatedAt) ?? new Date().toISOString(),
        });
    } catch (error) {
        console.error('[GET /api/finance/settings]', error);
        res.status(500).json({ error: 'Failed to load settings' });
    }
});

router.patch('/settings', async (req, res) => {
    try {
        const { monthlyPlayerFee, trainingLevy, facilityFee, autoAdjust } = req.body;
        const ref = firestore.collection('financialSettings').doc('1');
        await ensureSettings();

        await ref.set({
            ...(monthlyPlayerFee !== undefined && { monthlyPlayerFee }),
            ...(trainingLevy !== undefined && { trainingLevy }),
            ...(facilityFee !== undefined && { facilityFee }),
            ...(autoAdjust !== undefined && { autoAdjust }),
            updatedAt: new Date(),
        }, { merge: true });

        const snap = await ref.get();
        const data = snap.data() as Record<string, unknown>;
        res.json({
            ...data,
            updatedAt: toIso(data.updatedAt as any) ?? new Date().toISOString(),
        });
    } catch (error) {
        console.error('[PATCH /api/finance/settings]', error);
        res.status(500).json({ error: 'Failed to update settings' });
    }
});

export default router;
