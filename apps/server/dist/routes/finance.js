"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
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
router.get('/documents', (_req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const snap = yield firebaseAdmin_1.firestore.collection('financialDocuments').orderBy('date', 'desc').get();
        const docs = snap.docs.map((docSnap) => {
            var _a;
            const data = docSnap.data();
            return Object.assign(Object.assign({}, data), { date: (_a = (0, firebaseAdmin_1.toIso)(data.date)) !== null && _a !== void 0 ? _a : new Date().toISOString() });
        });
        res.json(docs);
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to fetch documents' });
    }
}));
router.patch('/documents/:id/status', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const id = Number(req.params.id);
    const { status } = req.body;
    if (!status || !['pending', 'processed', 'rejected'].includes(status)) {
        res.status(400).json({ error: 'Invalid status' });
        return;
    }
    try {
        const snap = yield firebaseAdmin_1.firestore.collection('financialDocuments').where('id', '==', id).limit(1).get();
        const docSnap = snap.docs[0];
        if (!docSnap) {
            res.status(404).json({ error: 'Document not found' });
            return;
        }
        yield docSnap.ref.set({ status }, { merge: true });
        const updated = yield docSnap.ref.get();
        res.json(Object.assign(Object.assign({}, updated.data()), { date: (_a = (0, firebaseAdmin_1.toIso)(updated.data().date)) !== null && _a !== void 0 ? _a : null }));
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to update document status' });
    }
}));
router.post('/upload', upload.single('file'), (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        if (!req.file) {
            res.status(400).json({ error: 'No file uploaded' });
            return;
        }
        const { type, amount, description } = req.body;
        const documentUrl = `/uploads/${req.file.filename}`;
        const id = yield (0, firebaseAdmin_1.nextNumericId)('financialDocuments');
        const record = {
            id,
            type: type || 'expense',
            amount: amount ? parseInt(amount, 10) : 0,
            description: description || 'New Document',
            documentUrl,
            status: 'pending',
            date: new Date(),
        };
        yield firebaseAdmin_1.firestore.collection('financialDocuments').doc(String(id)).set(record);
        res.json(Object.assign(Object.assign({}, record), { date: new Date().toISOString() }));
    }
    catch (error) {
        console.error('[POST /api/finance/upload] error:', error);
        res.status(500).json({ error: 'Failed to upload document' });
    }
}));
function ensureSettings() {
    return __awaiter(this, void 0, void 0, function* () {
        const ref = firebaseAdmin_1.firestore.collection('financialSettings').doc('1');
        const snap = yield ref.get();
        if (snap.exists) {
            return snap;
        }
        yield ref.set({
            id: 1,
            monthlyPlayerFee: 0,
            trainingLevy: 0,
            facilityFee: 0,
            autoAdjust: 1,
            updatedAt: new Date(),
        });
        return ref.get();
    });
}
router.get('/settings', (_req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const snap = yield ensureSettings();
        const data = snap.data();
        res.json(Object.assign(Object.assign({}, data), { updatedAt: (_a = (0, firebaseAdmin_1.toIso)(data.updatedAt)) !== null && _a !== void 0 ? _a : new Date().toISOString() }));
    }
    catch (error) {
        console.error('[GET /api/finance/settings]', error);
        res.status(500).json({ error: 'Failed to load settings' });
    }
}));
router.patch('/settings', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const { monthlyPlayerFee, trainingLevy, facilityFee, autoAdjust } = req.body;
        const ref = firebaseAdmin_1.firestore.collection('financialSettings').doc('1');
        yield ensureSettings();
        yield ref.set(Object.assign(Object.assign(Object.assign(Object.assign(Object.assign({}, (monthlyPlayerFee !== undefined && { monthlyPlayerFee })), (trainingLevy !== undefined && { trainingLevy })), (facilityFee !== undefined && { facilityFee })), (autoAdjust !== undefined && { autoAdjust })), { updatedAt: new Date() }), { merge: true });
        const snap = yield ref.get();
        const data = snap.data();
        res.json(Object.assign(Object.assign({}, data), { updatedAt: (_a = (0, firebaseAdmin_1.toIso)(data.updatedAt)) !== null && _a !== void 0 ? _a : new Date().toISOString() }));
    }
    catch (error) {
        console.error('[PATCH /api/finance/settings]', error);
        res.status(500).json({ error: 'Failed to update settings' });
    }
}));
exports.default = router;
