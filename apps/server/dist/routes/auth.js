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
var _a, _b;
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const db_1 = require("../db");
const schema_1 = require("../db/schema");
const drizzle_orm_1 = require("drizzle-orm");
const manageAccessRepository_1 = require("../lib/manageAccessRepository");
const password_1 = require("../lib/password");
const auth_1 = require("../middleware/auth");
const invitationsService_1 = require("../services/invitationsService");
const manageAccessService_1 = require("../lib/manageAccessService");
const loadEnv_1 = require("../lib/loadEnv");
const firebaseAdmin_1 = require("../lib/firebaseAdmin");
const publicUrl_1 = require("../lib/publicUrl");
const resend_1 = require("resend");
const crypto_1 = __importDefault(require("crypto"));
const router = (0, express_1.Router)();
(0, loadEnv_1.loadServerEnv)();
const RESEND_API_KEY = ((_a = process.env.RESEND_API_KEY) === null || _a === void 0 ? void 0 : _a.trim()) || '';
const RESEND_FROM_EMAIL = ((_b = process.env.RESEND_FROM_EMAIL) === null || _b === void 0 ? void 0 : _b.trim()) || 'BCMS <no-reply@bcms.ro>';
const resend = RESEND_API_KEY ? new resend_1.Resend(RESEND_API_KEY) : null;
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
function findPlayerTeamIdsByEmail(email) {
    return __awaiter(this, void 0, void 0, function* () {
        if (!email) {
            return [];
        }
        const playerRows = yield db_1.db.select().from(schema_1.players).where((0, drizzle_orm_1.eq)(schema_1.players.email, email)).limit(1);
        const player = playerRows[0];
        if (!player) {
            return [];
        }
        const ids = new Set();
        if (player.teamId != null) {
            ids.add(player.teamId);
        }
        const relationRows = yield db_1.db
            .select({ teamId: schema_1.playersToTeams.teamId })
            .from(schema_1.playersToTeams)
            .where((0, drizzle_orm_1.eq)(schema_1.playersToTeams.playerId, player.id));
        relationRows.forEach((row) => ids.add(row.teamId));
        return Array.from(ids).map(String);
    });
}
function normalizeEmail(value) {
    return value.trim().toLowerCase();
}
function sendForgotPasswordEmail(email, resetLink, name) {
    return __awaiter(this, void 0, void 0, function* () {
        if (!resend) {
            throw new Error('RESEND_API_KEY is missing.');
        }
        const displayName = (name === null || name === void 0 ? void 0 : name.trim()) || email.split('@')[0] || 'there';
        yield resend.emails.send({
            from: RESEND_FROM_EMAIL,
            to: email,
            subject: 'Reset your BCMS password',
            html: `
          <div style="margin:0;padding:0;background:#eef3ff;font-family:Inter,Arial,sans-serif">
            <div style="max-width:640px;margin:0 auto;padding:32px 18px">
              <div style="background:#fff;border:1px solid #dbe4ff;border-radius:28px;padding:32px;box-shadow:0 24px 70px rgba(23,58,168,.08)">
                <div style="display:inline-block;padding:8px 12px;border-radius:999px;background:#e7eeff;color:#173aa8;font-size:12px;font-weight:800;letter-spacing:.18em;text-transform:uppercase">BCMS security</div>
                <h1 style="margin:20px 0 12px;font-size:30px;line-height:1.1;color:#102a72">Reset your password</h1>
                <p style="font-size:16px;line-height:1.7;color:#334155;margin:0 0 10px">Hi ${displayName},</p>
                <p style="font-size:16px;line-height:1.7;color:#334155;margin:0 0 22px">We received a request to reset the password for your BCMS account.</p>
                <p style="margin:0 0 18px">
                  <a href="${resetLink}" style="display:inline-block;background:#173aa8;color:#fff;text-decoration:none;padding:14px 24px;border-radius:999px;font-weight:800">Reset password</a>
                </p>
                <p style="font-size:13px;color:#64748b;line-height:1.6;margin:0 0 12px">If the button does not work, open this link:</p>
                <p style="font-size:13px;color:#64748b;word-break:break-all;line-height:1.5;margin:0">${resetLink}</p>
              </div>
            </div>
          </div>
        `,
            text: `Hi ${displayName}, reset your BCMS password here: ${resetLink}`,
        });
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
        const teamIds = yield findPlayerTeamIdsByEmail(user.email);
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
                teamIds,
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
router.post('/forgot-password', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c, _d, _e;
    try {
        const email = normalizeEmail(String((_b = (_a = req.body) === null || _a === void 0 ? void 0 : _a.email) !== null && _b !== void 0 ? _b : ''));
        if (!email) {
            return res.status(400).json({ error: 'Email is required.' });
        }
        const existingUsers = yield db_1.db
            .select()
            .from(schema_1.users)
            .where((0, drizzle_orm_1.eq)(schema_1.users.email, email))
            .limit(1);
        const existingUser = existingUsers[0];
        if (!existingUser) {
            return res.status(404).json({ error: 'Nu exista niciun cont creat cu acest email.' });
        }
        if (existingUser.status === 'disabled') {
            return res.status(403).json({ error: 'Contul este dezactivat. Contacteaza administratorul clubului.' });
        }
        let firebaseUserRecord;
        try {
            firebaseUserRecord = existingUser.firebaseUid
                ? yield firebaseAdmin_1.firebaseAuth.getUser(existingUser.firebaseUid)
                : yield firebaseAdmin_1.firebaseAuth.getUserByEmail(email);
        }
        catch (error) {
            if ((error === null || error === void 0 ? void 0 : error.code) === 'auth/user-not-found') {
                try {
                    firebaseUserRecord = yield firebaseAdmin_1.firebaseAuth.getUserByEmail(email);
                }
                catch (emailLookupError) {
                    if ((emailLookupError === null || emailLookupError === void 0 ? void 0 : emailLookupError.code) !== 'auth/user-not-found') {
                        throw emailLookupError;
                    }
                    firebaseUserRecord = yield firebaseAdmin_1.firebaseAuth.createUser({
                        email,
                        displayName: (_c = existingUser.name) !== null && _c !== void 0 ? _c : email,
                        password: crypto_1.default.randomBytes(24).toString('base64url'),
                        disabled: false,
                    });
                }
            }
            else {
                throw error;
            }
        }
        if (firebaseUserRecord.uid && existingUser.firebaseUid !== firebaseUserRecord.uid) {
            yield db_1.db.update(schema_1.users).set({
                firebaseUid: firebaseUserRecord.uid,
                updatedAt: new Date().toISOString(),
            }).where((0, drizzle_orm_1.eq)(schema_1.users.id, existingUser.id));
        }
        const resetLink = yield firebaseAdmin_1.firebaseAuth.generatePasswordResetLink(email, {
            url: `${(0, publicUrl_1.resolvePublicAppUrl)()}/login?reset=1`,
        });
        yield sendForgotPasswordEmail(email, resetLink, (_e = (_d = existingUser.firstName) !== null && _d !== void 0 ? _d : existingUser.name) !== null && _e !== void 0 ? _e : null);
        res.json({
            success: true,
            message: 'Password reset email sent successfully.',
        });
    }
    catch (error) {
        console.error('Forgot password error:', error);
        res.status(500).json({ error: 'Nu am putut trimite emailul de resetare a parolei.' });
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
        const rawToken = String(token);
        const invitation = yield (0, invitationsService_1.validateInvitationToken)(rawToken);
        if (invitation) {
            if (invitation.isExpired || invitation.status !== 'pending') {
                return res.status(400).json({ error: 'Invite expired' });
            }
            return res.json(Object.assign({ success: true, source: 'invitation' }, invitation));
        }
        try {
            const manageAccessInvite = yield (0, manageAccessService_1.validateInviteToken)(rawToken);
            return res.json(Object.assign({ success: true, source: 'manage-access', email: null, status: 'pending', canAccept: true, message: null }, manageAccessInvite));
        }
        catch (error) {
            const message = error instanceof Error ? error.message : 'Invite not found or already used/expired';
            return res.status(404).json({ error: message });
        }
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
        let result;
        const classicInvitation = yield (0, invitationsService_1.validateInvitationToken)(String(inviteToken));
        if (classicInvitation) {
            result = yield (0, invitationsService_1.acceptInvitation)({
                token: inviteToken,
                firebaseUid: firebaseUser.uid,
                email: firebaseUser.email || '',
                firstName,
                lastName,
            });
        }
        else {
            const manageAccessInvite = yield (0, manageAccessService_1.validateInviteToken)(String(inviteToken));
            let userRecord = req.user;
            if (!userRecord) {
                const inserted = yield db_1.db.insert(schema_1.users).values({
                    firebaseUid: firebaseUser.uid,
                    email: firebaseUser.email || '',
                    name,
                    firstName,
                    lastName,
                    role: manageAccessInvite.role,
                    status: 'pending',
                    clubId: manageAccessInvite.clubId,
                }).returning();
                userRecord = inserted[0];
            }
            else {
                const updated = yield db_1.db.update(schema_1.users).set({
                    firebaseUid: firebaseUser.uid,
                    email: firebaseUser.email || '',
                    name,
                    firstName,
                    lastName,
                    role: manageAccessInvite.role,
                    status: 'pending',
                    clubId: manageAccessInvite.clubId,
                    updatedAt: new Date().toISOString(),
                }).where((0, drizzle_orm_1.eq)(schema_1.users.id, req.user.id)).returning();
                userRecord = updated[0];
            }
            yield (0, manageAccessService_1.createPendingAccessRequestForSignup)({
                userId: userRecord.id,
                clubId: manageAccessInvite.clubId,
                role: manageAccessInvite.role,
            });
            result = {
                userId: userRecord.id,
                clubId: manageAccessInvite.clubId,
                role: manageAccessInvite.role,
                status: 'pending',
            };
        }
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
