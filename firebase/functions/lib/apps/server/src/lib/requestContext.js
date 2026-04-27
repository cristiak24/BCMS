"use strict";
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
async function getRequestUser(req) {
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
            clubId: clubId ?? 1,
            status: 'processed',
            isHardcodedAdmin: true,
        };
    }
    const user = userId != null
        ? await (0, firebaseAdmin_1.fetchDocByNumericId)('users', userId)
        : rawUserId
            ? await (0, firebaseAdmin_1.fetchDocById)('users', rawUserId)
            : null;
    if (!user) {
        return null;
    }
    return {
        id: typeof user.id === 'number' ? user.id : Number(user.id) || 0,
        email: user.email,
        name: user.name,
        role: user.role,
        clubId: user.clubId ?? clubId,
        status: user.status,
    };
}
async function requireRequestUser(req, res) {
    const user = await getRequestUser(req);
    if (!user) {
        res.status(401).json({ error: 'Authentication required.' });
        return null;
    }
    return user;
}
async function requireClubAdmin(req, res) {
    const user = await requireRequestUser(req, res);
    if (!user) {
        return null;
    }
    if ((0, requestAuth_1.normalizeRole)(user.role) !== 'admin' || user.clubId == null) {
        res.status(403).json({ error: 'Club admin access is required.' });
        return null;
    }
    return user;
}
