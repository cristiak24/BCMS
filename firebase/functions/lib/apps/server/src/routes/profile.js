"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const multer_1 = __importDefault(require("multer"));
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const requestContext_1 = require("../lib/requestContext");
const requestAuth_1 = require("../lib/requestAuth");
const firebaseAdmin_1 = require("../lib/firebaseAdmin");
const router = (0, express_1.Router)();
const uploadDir = path_1.default.join(__dirname, '../../uploads/avatars');
if (!fs_1.default.existsSync(uploadDir)) {
    fs_1.default.mkdirSync(uploadDir, { recursive: true });
}
const storage = multer_1.default.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadDir),
    filename: (_req, file, cb) => {
        const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
        cb(null, `${file.fieldname}-${uniqueSuffix}${path_1.default.extname(file.originalname)}`);
    },
});
const upload = (0, multer_1.default)({ storage });
async function findUserByNumericId(userId) {
    const snap = await firebaseAdmin_1.firestore.collection('users').where('id', '==', userId).limit(1).get();
    return snap.docs[0] ?? null;
}
async function resolveProfileRecord(userId, reqClubId) {
    const userSnap = await findUserByNumericId(userId);
    if (!userSnap) {
        return null;
    }
    const user = userSnap.data();
    const clubId = user.clubId ?? (reqClubId ? Number(reqClubId) : null);
    const clubSnap = clubId ? await firebaseAdmin_1.firestore.collection('clubs').doc(String(clubId)).get() : null;
    const clubName = clubSnap?.exists ? clubSnap.data().name ?? null : null;
    const playerSnap = user.email
        ? await firebaseAdmin_1.firestore.collection('players').where('email', '==', user.email).limit(1).get()
        : null;
    const player = playerSnap?.docs[0]?.data();
    let teamName = null;
    if (player?.teamId != null) {
        const teamSnap = await firebaseAdmin_1.firestore.collection('teams').doc(String(player.teamId)).get();
        teamName = teamSnap.exists ? teamSnap.data().name ?? null : null;
    }
    else if (player?.id != null) {
        const relationSnap = await firebaseAdmin_1.firestore.collection('playersToTeams').where('playerId', '==', player.id).limit(1).get();
        const relation = relationSnap.docs[0]?.data();
        if (relation?.teamId != null) {
            const teamSnap = await firebaseAdmin_1.firestore.collection('teams').doc(String(relation.teamId)).get();
            teamName = teamSnap.exists ? teamSnap.data().name ?? null : null;
        }
    }
    const firstName = user.firstName ?? player?.firstName ?? user.name.split(' ')[0] ?? '';
    const lastName = user.lastName ?? player?.lastName ?? user.name.split(' ').slice(1).join(' ') ?? '';
    const fullName = [firstName, lastName].filter(Boolean).join(' ').trim() || user.name;
    return {
        id: user.id,
        email: user.email,
        name: user.name,
        firstName,
        lastName,
        fullName,
        role: user.role,
        status: user.status,
        clubId,
        clubName,
        teamName,
        avatarUrl: user.avatarUrl ?? null,
        phone: user.phone ?? null,
        preferredLanguage: user.preferredLanguage ?? null,
        notificationPreferences: (user.notificationPreferences ?? null),
        createdAt: (0, firebaseAdmin_1.toIso)(user.createdAt) ?? null,
        lastLoginAt: (0, firebaseAdmin_1.toIso)(user.lastLoginAt) ?? null,
    };
}
router.get('/me', async (req, res) => {
    try {
        const requestUser = await (0, requestContext_1.getRequestUser)(req);
        if (!requestUser) {
            return res.status(401).json({ error: 'Not authenticated' });
        }
        if (requestUser.isHardcodedAdmin || (requestUser.id === 0 && (0, requestAuth_1.isDemoAdmin)(req))) {
            const clubId = requestUser.clubId ?? (req.header('x-user-club-id') ? Number(req.header('x-user-club-id')) : null);
            const clubSnap = clubId ? await firebaseAdmin_1.firestore.collection('clubs').doc(String(clubId)).get() : null;
            const clubName = clubSnap?.exists ? clubSnap.data().name ?? null : null;
            return res.json({
                id: 0,
                email: 'admin@test.com',
                name: 'Admin User',
                firstName: 'Admin',
                lastName: 'User',
                fullName: 'Admin User',
                role: 'admin',
                status: 'processed',
                clubId,
                clubName,
                teamName: null,
                avatarUrl: null,
                phone: null,
                preferredLanguage: null,
                notificationPreferences: { email: true, push: true, sms: false },
                createdAt: null,
                lastLoginAt: null,
            });
        }
        const profile = await resolveProfileRecord(requestUser.id, req.header('x-user-club-id'));
        if (!profile) {
            return res.status(404).json({ error: 'Profile not found' });
        }
        return res.json(profile);
    }
    catch (error) {
        console.error('[GET /api/profile/me] error:', error);
        return res.status(500).json({ error: 'Failed to load profile' });
    }
});
router.patch('/me', async (req, res) => {
    try {
        const requestUser = await (0, requestContext_1.getRequestUser)(req);
        if (!requestUser) {
            return res.status(401).json({ error: 'Not authenticated' });
        }
        if (requestUser.isHardcodedAdmin || (requestUser.id === 0 && (0, requestAuth_1.isDemoAdmin)(req))) {
            return res.status(400).json({ error: 'Demo admin profile cannot be edited from the database-backed profile endpoint.' });
        }
        const { firstName, lastName, phone, preferredLanguage, notificationPreferences } = req.body;
        const trimmedFirstName = typeof firstName === 'string' ? firstName.trim() : undefined;
        const trimmedLastName = typeof lastName === 'string' ? lastName.trim() : undefined;
        const trimmedPhone = typeof phone === 'string' ? phone.trim() : phone === null ? null : undefined;
        const trimmedLanguage = typeof preferredLanguage === 'string' ? preferredLanguage.trim() : preferredLanguage === null ? null : undefined;
        const userSnap = await findUserByNumericId(requestUser.id);
        if (!userSnap) {
            return res.status(404).json({ error: 'Profile not found' });
        }
        const existingUser = userSnap.data();
        const nextName = [
            trimmedFirstName ?? existingUser.firstName ?? '',
            trimmedLastName ?? existingUser.lastName ?? '',
        ].filter(Boolean).join(' ').trim();
        await userSnap.ref.set({
            ...(trimmedFirstName !== undefined ? { firstName: trimmedFirstName } : {}),
            ...(trimmedLastName !== undefined ? { lastName: trimmedLastName } : {}),
            ...(trimmedPhone !== undefined ? { phone: trimmedPhone } : {}),
            ...(trimmedLanguage !== undefined ? { preferredLanguage: trimmedLanguage } : {}),
            ...(notificationPreferences !== undefined ? { notificationPreferences } : {}),
            ...(nextName ? { name: nextName } : {}),
            updatedAt: new Date(),
        }, { merge: true });
        const profile = await resolveProfileRecord(requestUser.id, req.header('x-user-club-id'));
        return res.json(profile);
    }
    catch (error) {
        console.error('[PATCH /api/profile/me] error:', error);
        return res.status(500).json({ error: 'Failed to update profile' });
    }
});
router.post('/me/password', async (_req, res) => {
    res.status(400).json({
        error: 'Password changes are handled by Firebase Auth on the client.',
    });
});
router.post('/me/avatar', upload.single('image'), async (req, res) => {
    try {
        const requestUser = await (0, requestContext_1.getRequestUser)(req);
        if (!requestUser) {
            return res.status(401).json({ error: 'Not authenticated' });
        }
        if (requestUser.isHardcodedAdmin || (requestUser.id === 0 && (0, requestAuth_1.isDemoAdmin)(req))) {
            return res.status(400).json({ error: 'Demo admin avatar cannot be changed from the database-backed profile endpoint.' });
        }
        if (!req.file) {
            return res.status(400).json({ error: 'No image uploaded' });
        }
        const avatarUrl = `/uploads/avatars/${req.file.filename}`;
        const userSnap = await findUserByNumericId(requestUser.id);
        if (!userSnap) {
            return res.status(404).json({ error: 'Profile not found' });
        }
        await userSnap.ref.set({
            avatarUrl,
            updatedAt: new Date(),
        }, { merge: true });
        return res.json({ success: true, avatarUrl });
    }
    catch (error) {
        console.error('[POST /api/profile/me/avatar] error:', error);
        return res.status(500).json({ error: 'Failed to upload avatar' });
    }
});
exports.default = router;
