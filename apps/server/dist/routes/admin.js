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
// GET /api/admin/requests
// Get all users with status 'pending'
router.get('/requests', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const pendingUsers = yield db_1.db.select({
            id: schema_1.users.id,
            email: schema_1.users.email,
            name: schema_1.users.name,
            role: schema_1.users.role,
            status: schema_1.users.status,
        })
            .from(schema_1.users)
            .where((0, drizzle_orm_1.eq)(schema_1.users.status, 'pending'));
        res.json(pendingUsers);
    }
    catch (error) {
        console.error('Error fetching requests:', error);
        res.status(500).json({ error: 'Failed to fetch pending requests' });
    }
}));
// POST /api/admin/requests/:id/approve
// Approve a user: Set status to 'processed' and assign a role
router.post('/requests/:id/approve', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { id } = req.params;
    const { role } = req.body; // Admin selects the role
    if (!role) {
        return res.status(400).json({ error: 'Role is required for approval' });
    }
    try {
        const updated = yield db_1.db
            .update(schema_1.users)
            .set({
            status: 'processed',
            role: role // 'admin', 'coach', 'accountant'
        })
            .where((0, drizzle_orm_1.eq)(schema_1.users.id, Number(id)))
            .returning({
            id: schema_1.users.id,
            email: schema_1.users.email,
            name: schema_1.users.name,
            role: schema_1.users.role,
            status: schema_1.users.status
        });
        if (updated.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }
        res.json({ success: true, user: updated[0] });
    }
    catch (error) {
        console.error('Error approving user:', error);
        res.status(500).json({ error: 'Failed to approve user' });
    }
}));
// POST /api/admin/requests/:id/reject
// Reject a user: Set status to 'rejected' (or delete?)
router.post('/requests/:id/reject', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { id } = req.params;
    try {
        const updated = yield db_1.db
            .update(schema_1.users)
            .set({ status: 'rejected' })
            .where((0, drizzle_orm_1.eq)(schema_1.users.id, Number(id)))
            .returning();
        if (updated.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }
        res.json({ success: true, message: 'User rejected' });
    }
    catch (error) {
        console.error('Error rejecting user:', error);
        res.status(500).json({ error: 'Failed to reject user' });
    }
}));
exports.default = router;
