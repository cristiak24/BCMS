"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const multer_1 = __importDefault(require("multer"));
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const firebaseAdmin_1 = require("../lib/firebaseAdmin");
const router = (0, express_1.Router)();
const uploadDir = path_1.default.join(__dirname, '../../uploads');
if (!fs_1.default.existsSync(uploadDir)) {
    fs_1.default.mkdirSync(uploadDir, { recursive: true });
}
const storage = multer_1.default.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadDir),
    filename: (_req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, file.fieldname + '-' + uniqueSuffix + path_1.default.extname(file.originalname));
    }
});
const upload = (0, multer_1.default)({ storage });
router.get('/documents', async (_req, res) => {
    try {
        const snap = await firebaseAdmin_1.firestore.collection('financialDocuments').orderBy('date', 'desc').get();
        const docs = snap.docs.map((docSnap) => {
            const data = docSnap.data();
            return {
                ...data,
                date: (0, firebaseAdmin_1.toIso)(data.date) ?? new Date().toISOString(),
            };
        });
        res.json(docs);
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to fetch documents' });
    }
});
router.patch('/documents/:id/status', async (req, res) => {
    const id = Number(req.params.id);
    const { status } = req.body;
    if (!status || !['pending', 'processed', 'rejected'].includes(status)) {
        res.status(400).json({ error: 'Invalid status' });
        return;
    }
    try {
        const snap = await firebaseAdmin_1.firestore.collection('financialDocuments').where('id', '==', id).limit(1).get();
        const docSnap = snap.docs[0];
        if (!docSnap) {
            res.status(404).json({ error: 'Document not found' });
            return;
        }
        await docSnap.ref.set({ status }, { merge: true });
        const updated = await docSnap.ref.get();
        res.json({
            ...updated.data(),
            date: (0, firebaseAdmin_1.toIso)(updated.data().date) ?? null,
        });
    }
    catch (error) {
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
        const id = await (0, firebaseAdmin_1.nextNumericId)('financialDocuments');
        const record = {
            id,
            type: type || 'expense',
            amount: amount ? parseInt(amount, 10) : 0,
            description: description || 'New Document',
            documentUrl,
            status: 'pending',
            date: new Date(),
        };
        await firebaseAdmin_1.firestore.collection('financialDocuments').doc(String(id)).set(record);
        res.json({
            ...record,
            date: new Date().toISOString(),
        });
    }
    catch (error) {
        console.error('[POST /api/finance/upload] error:', error);
        res.status(500).json({ error: 'Failed to upload document' });
    }
});
async function ensureSettings() {
    const ref = firebaseAdmin_1.firestore.collection('financialSettings').doc('1');
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
        const data = snap.data();
        res.json({
            ...data,
            updatedAt: (0, firebaseAdmin_1.toIso)(data.updatedAt) ?? new Date().toISOString(),
        });
    }
    catch (error) {
        console.error('[GET /api/finance/settings]', error);
        res.status(500).json({ error: 'Failed to load settings' });
    }
});
router.patch('/settings', async (req, res) => {
    try {
        const { monthlyPlayerFee, trainingLevy, facilityFee, autoAdjust } = req.body;
        const ref = firebaseAdmin_1.firestore.collection('financialSettings').doc('1');
        await ensureSettings();
        await ref.set({
            ...(monthlyPlayerFee !== undefined && { monthlyPlayerFee }),
            ...(trainingLevy !== undefined && { trainingLevy }),
            ...(facilityFee !== undefined && { facilityFee }),
            ...(autoAdjust !== undefined && { autoAdjust }),
            updatedAt: new Date(),
        }, { merge: true });
        const snap = await ref.get();
        const data = snap.data();
        res.json({
            ...data,
            updatedAt: (0, firebaseAdmin_1.toIso)(data.updatedAt) ?? new Date().toISOString(),
        });
    }
    catch (error) {
        console.error('[PATCH /api/finance/settings]', error);
        res.status(500).json({ error: 'Failed to update settings' });
    }
});
exports.default = router;
