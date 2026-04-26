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
const manageAccessRepository_1 = require("../lib/manageAccessRepository");
const password_1 = require("../lib/password");
const auth_1 = require("../middleware/auth");
const crypto_1 = __importDefault(require("crypto"));
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
    try {
        const { email, clubName } = req.body;
        if (!email || !clubName) {
            return res.status(400).json({ error: 'Email and club name are required' });
        }
        // Ensure club exists
        const normalizedName = clubName.trim().toLowerCase();
        let clubRows = yield db_1.db.select().from(schema_1.clubs).where((0, drizzle_orm_1.eq)(schema_1.clubs.normalizedName, normalizedName)).limit(1);
        let clubId;
        if (clubRows.length === 0) {
            const inserted = yield db_1.db.insert(schema_1.clubs).values({
                name: clubName.trim(),
                normalizedName,
                createdBy: req.user.id.toString(),
            }).returning();
            clubId = inserted[0].id;
        }
        else {
            clubId = clubRows[0].id;
        }
        const token = crypto_1.default.randomBytes(32).toString('hex');
        const tokenHash = crypto_1.default.createHash('sha256').update(token).digest('hex');
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 7); // 7 days
        yield db_1.db.insert(schema_1.invites).values({
            email,
            role: 'admin',
            clubId,
            tokenHash,
            status: 'active',
            expiresAt: expiresAt.toISOString(),
            createdBy: req.user.id,
        });
        res.json({
            success: true,
            inviteToken: token,
            message: 'Invite created successfully.'
        });
    }
    catch (error) {
        console.error('Create invite error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
}));
// GET /api/auth/invites/validate
router.get('/invites/validate', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { token } = req.query;
        if (!token)
            return res.status(400).json({ error: 'Token is required' });
        const tokenHash = crypto_1.default.createHash('sha256').update(token).digest('hex');
        const inviteRows = yield db_1.db.select().from(schema_1.invites).where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.invites.tokenHash, tokenHash), (0, drizzle_orm_1.eq)(schema_1.invites.status, 'active'))).limit(1);
        const invite = inviteRows[0];
        if (!invite) {
            return res.status(404).json({ error: 'Invite not found or already used/expired' });
        }
        if (new Date(invite.expiresAt) < new Date()) {
            yield db_1.db.update(schema_1.invites).set({ status: 'expired' }).where((0, drizzle_orm_1.eq)(schema_1.invites.id, invite.id));
            return res.status(400).json({ error: 'Invite expired' });
        }
        const clubName = yield findClubName(invite.clubId);
        res.json({
            success: true,
            email: invite.email,
            role: invite.role,
            clubId: invite.clubId,
            clubName
        });
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
        const tokenHash = crypto_1.default.createHash('sha256').update(inviteToken).digest('hex');
        const inviteRows = yield db_1.db.select().from(schema_1.invites).where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.invites.tokenHash, tokenHash), (0, drizzle_orm_1.eq)(schema_1.invites.status, 'active'))).limit(1);
        const invite = inviteRows[0];
        if (!invite || new Date(invite.expiresAt) < new Date()) {
            return res.status(400).json({ error: 'Invite is invalid or expired' });
        }
        if (req.user) {
            return res.status(409).json({ error: 'User already exists' });
        }
        const { firstName, lastName } = (0, password_1.splitDisplayName)(name);
        const insertResult = yield db_1.db.insert(schema_1.users).values({
            firebaseUid: firebaseUser.uid,
            email: firebaseUser.email || invite.email,
            name,
            firstName,
            lastName,
            role: invite.role,
            status: 'active',
            clubId: invite.clubId,
        }).returning();
        const newUser = insertResult[0];
        yield db_1.db.update(schema_1.invites).set({
            status: 'used',
            usedBy: newUser.id,
            usedAt: new Date().toISOString()
        }).where((0, drizzle_orm_1.eq)(schema_1.invites.id, invite.id));
        res.status(201).json({
            success: true,
            user: newUser
        });
    }
    catch (error) {
        console.error('Complete invite signup error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
}));
exports.default = router;
