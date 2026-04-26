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
function findUserByNumericId(userId) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a;
        const snap = yield firebaseAdmin_1.firestore.collection('users').where('id', '==', userId).limit(1).get();
        return (_a = snap.docs[0]) !== null && _a !== void 0 ? _a : null;
    });
}
function resolveProfileRecord(userId, reqClubId) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r, _s, _t;
        const userSnap = yield findUserByNumericId(userId);
        if (!userSnap) {
            return null;
        }
        const user = userSnap.data();
        const clubId = (_a = user.clubId) !== null && _a !== void 0 ? _a : (reqClubId ? Number(reqClubId) : null);
        const clubSnap = clubId ? yield firebaseAdmin_1.firestore.collection('clubs').doc(String(clubId)).get() : null;
        const clubName = (clubSnap === null || clubSnap === void 0 ? void 0 : clubSnap.exists) ? (_b = clubSnap.data().name) !== null && _b !== void 0 ? _b : null : null;
        const playerSnap = user.email
            ? yield firebaseAdmin_1.firestore.collection('players').where('email', '==', user.email).limit(1).get()
            : null;
        const player = (_c = playerSnap === null || playerSnap === void 0 ? void 0 : playerSnap.docs[0]) === null || _c === void 0 ? void 0 : _c.data();
        let teamName = null;
        if ((player === null || player === void 0 ? void 0 : player.teamId) != null) {
            const teamSnap = yield firebaseAdmin_1.firestore.collection('teams').doc(String(player.teamId)).get();
            teamName = teamSnap.exists ? (_d = teamSnap.data().name) !== null && _d !== void 0 ? _d : null : null;
        }
        else if ((player === null || player === void 0 ? void 0 : player.id) != null) {
            const relationSnap = yield firebaseAdmin_1.firestore.collection('playersToTeams').where('playerId', '==', player.id).limit(1).get();
            const relation = (_e = relationSnap.docs[0]) === null || _e === void 0 ? void 0 : _e.data();
            if ((relation === null || relation === void 0 ? void 0 : relation.teamId) != null) {
                const teamSnap = yield firebaseAdmin_1.firestore.collection('teams').doc(String(relation.teamId)).get();
                teamName = teamSnap.exists ? (_f = teamSnap.data().name) !== null && _f !== void 0 ? _f : null : null;
            }
        }
        const firstName = (_j = (_h = (_g = user.firstName) !== null && _g !== void 0 ? _g : player === null || player === void 0 ? void 0 : player.firstName) !== null && _h !== void 0 ? _h : user.name.split(' ')[0]) !== null && _j !== void 0 ? _j : '';
        const lastName = (_m = (_l = (_k = user.lastName) !== null && _k !== void 0 ? _k : player === null || player === void 0 ? void 0 : player.lastName) !== null && _l !== void 0 ? _l : user.name.split(' ').slice(1).join(' ')) !== null && _m !== void 0 ? _m : '';
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
            avatarUrl: (_o = user.avatarUrl) !== null && _o !== void 0 ? _o : null,
            phone: (_p = user.phone) !== null && _p !== void 0 ? _p : null,
            preferredLanguage: (_q = user.preferredLanguage) !== null && _q !== void 0 ? _q : null,
            notificationPreferences: ((_r = user.notificationPreferences) !== null && _r !== void 0 ? _r : null),
            createdAt: (_s = (0, firebaseAdmin_1.toIso)(user.createdAt)) !== null && _s !== void 0 ? _s : null,
            lastLoginAt: (_t = (0, firebaseAdmin_1.toIso)(user.lastLoginAt)) !== null && _t !== void 0 ? _t : null,
        };
    });
}
router.get('/me', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    try {
        const requestUser = yield (0, requestContext_1.getRequestUser)(req);
        if (!requestUser) {
            return res.status(401).json({ error: 'Not authenticated' });
        }
        if (requestUser.isHardcodedAdmin || (requestUser.id === 0 && (0, requestAuth_1.isDemoAdmin)(req))) {
            const clubId = (_a = requestUser.clubId) !== null && _a !== void 0 ? _a : (req.header('x-user-club-id') ? Number(req.header('x-user-club-id')) : null);
            const clubSnap = clubId ? yield firebaseAdmin_1.firestore.collection('clubs').doc(String(clubId)).get() : null;
            const clubName = (clubSnap === null || clubSnap === void 0 ? void 0 : clubSnap.exists) ? (_b = clubSnap.data().name) !== null && _b !== void 0 ? _b : null : null;
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
        const profile = yield resolveProfileRecord(requestUser.id, req.header('x-user-club-id'));
        if (!profile) {
            return res.status(404).json({ error: 'Profile not found' });
        }
        return res.json(profile);
    }
    catch (error) {
        console.error('[GET /api/profile/me] error:', error);
        return res.status(500).json({ error: 'Failed to load profile' });
    }
}));
router.patch('/me', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    try {
        const requestUser = yield (0, requestContext_1.getRequestUser)(req);
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
        const userSnap = yield findUserByNumericId(requestUser.id);
        if (!userSnap) {
            return res.status(404).json({ error: 'Profile not found' });
        }
        const existingUser = userSnap.data();
        const nextName = [
            (_a = trimmedFirstName !== null && trimmedFirstName !== void 0 ? trimmedFirstName : existingUser.firstName) !== null && _a !== void 0 ? _a : '',
            (_b = trimmedLastName !== null && trimmedLastName !== void 0 ? trimmedLastName : existingUser.lastName) !== null && _b !== void 0 ? _b : '',
        ].filter(Boolean).join(' ').trim();
        yield userSnap.ref.set(Object.assign(Object.assign(Object.assign(Object.assign(Object.assign(Object.assign(Object.assign({}, (trimmedFirstName !== undefined ? { firstName: trimmedFirstName } : {})), (trimmedLastName !== undefined ? { lastName: trimmedLastName } : {})), (trimmedPhone !== undefined ? { phone: trimmedPhone } : {})), (trimmedLanguage !== undefined ? { preferredLanguage: trimmedLanguage } : {})), (notificationPreferences !== undefined ? { notificationPreferences } : {})), (nextName ? { name: nextName } : {})), { updatedAt: new Date() }), { merge: true });
        const profile = yield resolveProfileRecord(requestUser.id, req.header('x-user-club-id'));
        return res.json(profile);
    }
    catch (error) {
        console.error('[PATCH /api/profile/me] error:', error);
        return res.status(500).json({ error: 'Failed to update profile' });
    }
}));
router.post('/me/password', (_req, res) => __awaiter(void 0, void 0, void 0, function* () {
    res.status(400).json({
        error: 'Password changes are handled by Firebase Auth on the client.',
    });
}));
router.post('/me/avatar', upload.single('image'), (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const requestUser = yield (0, requestContext_1.getRequestUser)(req);
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
        const userSnap = yield findUserByNumericId(requestUser.id);
        if (!userSnap) {
            return res.status(404).json({ error: 'Profile not found' });
        }
        yield userSnap.ref.set({
            avatarUrl,
            updatedAt: new Date(),
        }, { merge: true });
        return res.json({ success: true, avatarUrl });
    }
    catch (error) {
        console.error('[POST /api/profile/me/avatar] error:', error);
        return res.status(500).json({ error: 'Failed to upload avatar' });
    }
}));
exports.default = router;
