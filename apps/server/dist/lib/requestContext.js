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
exports.getRequestUser = getRequestUser;
exports.requireRequestUser = requireRequestUser;
exports.requireClubAdmin = requireClubAdmin;
const requestAuth_1 = require("./requestAuth");
const firebaseAdmin_1 = require("./firebaseAdmin");
const ADMIN_ROLES = new Set([
    'admin',
    'club_admin',
    'club-admin',
    'administrator',
    'owner',
    'superuser',
]);
function parseNumericHeader(value) {
    if (!value) {
        return null;
    }
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
}
function getRequestUser(req) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a;
        const rawUserId = req.header('x-user-id');
        const userId = parseNumericHeader(rawUserId);
        const role = (0, requestAuth_1.normalizeRole)(req.header('x-user-role'));
        const clubId = parseNumericHeader(req.header('x-user-club-id'));
        if (userId == null || !role) {
            return null;
        }
        if (userId === 0 && ADMIN_ROLES.has(role)) {
            return {
                id: 0,
                email: 'admin@test.com',
                name: 'Admin User',
                role: 'admin',
                clubId: clubId !== null && clubId !== void 0 ? clubId : 1,
                status: 'processed',
                isHardcodedAdmin: true,
            };
        }
        const user = userId != null
            ? yield (0, firebaseAdmin_1.fetchDocByNumericId)('users', userId)
            : rawUserId
                ? yield (0, firebaseAdmin_1.fetchDocById)('users', rawUserId)
                : null;
        if (!user) {
            return null;
        }
        return {
            id: typeof user.id === 'number' ? user.id : Number(user.id) || 0,
            email: user.email,
            name: user.name,
            role: user.role,
            clubId: (_a = user.clubId) !== null && _a !== void 0 ? _a : clubId,
            status: user.status,
        };
    });
}
function requireRequestUser(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        const user = yield getRequestUser(req);
        if (!user) {
            res.status(401).json({ error: 'Authentication required.' });
            return null;
        }
        return user;
    });
}
function requireClubAdmin(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        const user = yield requireRequestUser(req, res);
        if (!user) {
            return null;
        }
        if ((0, requestAuth_1.normalizeRole)(user.role) !== 'admin' || user.clubId == null) {
            res.status(403).json({ error: 'Club admin access is required.' });
            return null;
        }
        return user;
    });
}
