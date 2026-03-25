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
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const db_1 = require("../db");
const schema_1 = require("../db/schema");
const drizzle_orm_1 = require("drizzle-orm");
const router = (0, express_1.Router)();
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
exports.default = router;
