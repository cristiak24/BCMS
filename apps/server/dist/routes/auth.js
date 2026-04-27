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
const manageAccessRepository_1 = require("../lib/manageAccessRepository");
const password_1 = require("../lib/password");
const auth_1 = require("../middleware/auth");
const invitationsService_1 = require("../services/invitationsService");
const router = (0, express_1.Router)();
function findClubName(clubId) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b;
        if (clubId == null) {
            return null;
        }
        const clubRows = yield db_1.db.select({ name: schema_1.clubs.name }).from(schema_1.clubs).where((0, drizzle_orm_1.eq)(schema_1.clubs.id, clubId)).limit(1);
        return (_b = (_a = clubRows[0]) === null || _a === void 0 ? void 0 : _a.name) !== null && _b !== void 0 ? _b : null;
    });
}
// GET /api/auth/me
router.get('/me', auth_1.authenticate, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        if (!req.user) {
            return res.status(404).json({ error: 'User profile not found' });
        }
        const user = req.user;
        const clubName = yield findClubName(user.clubId);
        res.json({
            success: true,
            user: {
                id: user.id,
                email: user.email,
                name: user.name,
                firstName: user.firstName,
                lastName: user.lastName,
                role: user.role,
                clubId: user.clubId,
                status: user.status,
                clubName,
                avatarUrl: user.avatarUrl,
                phone: user.phone,
                preferredLanguage: user.preferredLanguage,
                createdAt: user.createdAt,
                lastLoginAt: user.lastLoginAt,
            }
        });
    }
    catch (error) {
        console.error('Error fetching /me:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
}));
// POST /api/auth/complete-signup
router.post('/complete-signup', auth_1.authenticate, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { name, role } = req.body;
        const firebaseUser = req.firebaseUser;
        if (!name || !role) {
            return res.status(400).json({ error: 'Name and role are required' });
        }
        if (role !== 'player' && role !== 'coach' && role !== 'parent') {
            return res.status(400).json({ error: 'Invalid role for public signup' });
        }
        if (req.user) {
            return res.status(409).json({ error: 'User already exists' });
        }
        const { firstName, lastName } = (0, password_1.splitDisplayName)(name);
        const defaultClub = yield (0, manageAccessRepository_1.ensureDefaultClub)();
        const insertResult = yield db_1.db.insert(schema_1.users).values({
            firebaseUid: firebaseUser.uid,
            email: firebaseUser.email || '',
            name,
            firstName,
            lastName,
            role,
            status: 'active',
            clubId: defaultClub.id,
        }).returning();
        const newUser = insertResult[0];
        res.status(201).json({
            success: true,
            user: newUser
        });
    }
    catch (error) {
        console.error('Signup error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
}));
// POST /api/auth/superadmin/create-admin-invite
router.post('/superadmin/create-admin-invite', auth_1.authenticate, auth_1.requireSuperadmin, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c, _d;
    try {
        const result = yield (0, invitationsService_1.createSuperAdminInvitation)({
            email: String((_b = (_a = req.body) === null || _a === void 0 ? void 0 : _a.email) !== null && _b !== void 0 ? _b : ''),
            role: 'admin',
            clubId: Number((_c = req.body) === null || _c === void 0 ? void 0 : _c.clubId),
        }, {
            user: req.user,
            firebaseUser: req.firebaseUser,
            ip: req.ip,
            userAgent: (_d = req.get('user-agent')) !== null && _d !== void 0 ? _d : undefined,
        });
        res.status(201).json({
            success: true,
            invitation: result,
            message: 'Invite created successfully.'
        });
    }
    catch (error) {
        console.error('Create invite error:', error);
        const message = error instanceof Error ? error.message : 'Internal server error';
        res.status(400).json({ error: message });
    }
}));
// GET /api/auth/invites/validate
router.get('/invites/validate', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { token } = req.query;
        if (!token)
            return res.status(400).json({ error: 'Token is required' });
        const invitation = yield (0, invitationsService_1.validateInvitationToken)(String(token));
        if (!invitation) {
            return res.status(404).json({ error: 'Invite not found or already used/expired' });
        }
        if (invitation.isExpired || invitation.status !== 'pending') {
            return res.status(400).json({ error: 'Invite expired' });
        }
        res.json(Object.assign({ success: true }, invitation));
    }
    catch (error) {
        console.error('Validate invite error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
}));
// POST /api/auth/complete-invite-signup
router.post('/complete-invite-signup', auth_1.authenticate, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { name, inviteToken } = req.body;
        const firebaseUser = req.firebaseUser;
        if (!name || !inviteToken) {
            return res.status(400).json({ error: 'Name and invite token are required' });
        }
        const { firstName, lastName } = (0, password_1.splitDisplayName)(name);
        const result = yield (0, invitationsService_1.acceptInvitation)({
            token: inviteToken,
            firebaseUid: firebaseUser.uid,
            email: firebaseUser.email || '',
            firstName,
            lastName,
        });
        res.status(201).json({
            success: true,
            user: result
        });
    }
    catch (error) {
        console.error('Complete invite signup error:', error);
        const message = error instanceof Error ? error.message : 'Internal server error';
        res.status(400).json({ error: message });
    }
}));
exports.default = router;
