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
const firebaseAdmin_1 = require("../lib/firebaseAdmin");
const router = (0, express_1.Router)();
router.get('/requests', (_req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const pendingUsersSnap = yield firebaseAdmin_1.firestore.collection('users').where('status', '==', 'pending').get();
        const pendingUsers = pendingUsersSnap.docs.map((docSnap) => docSnap.data()).map((user) => ({
            id: user.id,
            email: user.email,
            name: user.name,
            role: user.role,
            status: user.status,
        }));
        res.json(pendingUsers);
    }
    catch (error) {
        console.error('Error fetching requests:', error);
        res.status(500).json({ error: 'Failed to fetch pending requests' });
    }
}));
router.post('/requests/:id/approve', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const id = Number(req.params.id);
    const { role } = req.body;
    if (!role) {
        return res.status(400).json({ error: 'Role is required for approval' });
    }
    if (Number.isNaN(id)) {
        return res.status(400).json({ error: 'Invalid user id' });
    }
    try {
        const snap = yield firebaseAdmin_1.firestore.collection('users').where('id', '==', id).limit(1).get();
        const docSnap = snap.docs[0];
        if (!docSnap) {
            return res.status(404).json({ error: 'User not found' });
        }
        const current = docSnap.data();
        const nextUser = Object.assign(Object.assign({}, current), { status: 'processed', role });
        yield docSnap.ref.set(nextUser, { merge: true });
        res.json({ success: true, user: nextUser });
    }
    catch (error) {
        console.error('Error approving user:', error);
        res.status(500).json({ error: 'Failed to approve user' });
    }
}));
router.post('/requests/:id/reject', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const id = Number(req.params.id);
    if (Number.isNaN(id)) {
        return res.status(400).json({ error: 'Invalid user id' });
    }
    try {
        const snap = yield firebaseAdmin_1.firestore.collection('users').where('id', '==', id).limit(1).get();
        const docSnap = snap.docs[0];
        if (!docSnap) {
            return res.status(404).json({ error: 'User not found' });
        }
        const current = docSnap.data();
        yield docSnap.ref.set(Object.assign(Object.assign({}, current), { status: 'rejected' }), { merge: true });
        res.json({ success: true, message: 'User rejected' });
    }
    catch (error) {
        console.error('Error rejecting user:', error);
        res.status(500).json({ error: 'Failed to reject user' });
    }
}));
exports.default = router;
