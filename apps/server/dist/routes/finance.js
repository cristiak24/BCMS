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
const db_1 = require("../db");
const schema_1 = require("../db/schema");
const drizzle_orm_1 = require("drizzle-orm");
const multer_1 = __importDefault(require("multer"));
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const router = (0, express_1.Router)();
// Ensure uploads dir
const uploadDir = path_1.default.join(__dirname, '../../uploads');
if (!fs_1.default.existsSync(uploadDir)) {
    fs_1.default.mkdirSync(uploadDir, { recursive: true });
}
const storage = multer_1.default.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, file.fieldname + '-' + uniqueSuffix + path_1.default.extname(file.originalname));
    }
});
const upload = (0, multer_1.default)({ storage });
// GET /api/finance/documents
router.get('/documents', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const docs = yield db_1.db.select().from(schema_1.financialDocuments);
        res.json(docs);
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to fetch documents' });
    }
}));
// PATCH /api/finance/documents/:id/status
router.patch('/documents/:id/status', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { id } = req.params;
    const { status } = req.body;
    if (!status || !['pending', 'processed', 'rejected'].includes(status)) {
        res.status(400).json({ error: 'Invalid status' });
        return;
    }
    try {
        const updated = yield db_1.db
            .update(schema_1.financialDocuments)
            .set({ status })
            .where((0, drizzle_orm_1.eq)(schema_1.financialDocuments.id, Number(id)))
            .returning();
        if (updated.length === 0) {
            res.status(404).json({ error: 'Document not found' });
            return;
        }
        res.json(updated[0]);
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to update document status' });
    }
}));
// POST /api/finance/upload
router.post('/upload', upload.single('file'), (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        if (!req.file) {
            res.status(400).json({ error: 'No file uploaded' });
            return;
        }
        const { type, amount, description } = req.body;
        const documentUrl = `/uploads/${req.file.filename}`;
        const newDoc = yield db_1.db.insert(schema_1.financialDocuments).values({
            type: type || 'expense',
            amount: amount ? parseInt(amount, 10) : 0,
            description: description || 'New Document',
            documentUrl,
            status: 'pending'
        }).returning();
        res.json(newDoc[0]);
    }
    catch (error) {
        console.error('[POST /api/finance/upload] error:', error);
        res.status(500).json({ error: 'Failed to upload document' });
    }
}));
// GET /api/finance/settings
router.get('/settings', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        let settings = yield db_1.db.select().from(schema_1.financialSettings).limit(1);
        if (settings.length === 0) {
            // Create default
            const newSettings = yield db_1.db.insert(schema_1.financialSettings).values({}).returning();
            res.json(newSettings[0]);
            return;
        }
        res.json(settings[0]);
    }
    catch (error) {
        console.error('[GET /api/finance/settings]', error);
        res.status(500).json({ error: 'Failed to load settings' });
    }
}));
// PATCH /api/finance/settings
router.patch('/settings', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { monthlyPlayerFee, trainingLevy, facilityFee, autoAdjust } = req.body;
        // Ensure at least one row exists
        let settings = yield db_1.db.select().from(schema_1.financialSettings).limit(1);
        if (settings.length === 0) {
            settings = yield db_1.db.insert(schema_1.financialSettings).values({}).returning();
        }
        const updated = yield db_1.db.update(schema_1.financialSettings)
            .set(Object.assign(Object.assign(Object.assign(Object.assign(Object.assign({}, (monthlyPlayerFee !== undefined && { monthlyPlayerFee })), (trainingLevy !== undefined && { trainingLevy })), (facilityFee !== undefined && { facilityFee })), (autoAdjust !== undefined && { autoAdjust })), { updatedAt: new Date() }))
            .where((0, drizzle_orm_1.eq)(schema_1.financialSettings.id, settings[0].id))
            .returning();
        res.json(updated[0]);
    }
    catch (error) {
        console.error('[PATCH /api/finance/settings]', error);
        res.status(500).json({ error: 'Failed to update settings' });
    }
}));
exports.default = router;
