"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizeRole = normalizeRole;
exports.getSessionUserId = getSessionUserId;
exports.isDemoAdmin = isDemoAdmin;
const ADMIN_ROLES = new Set([
    'admin',
    'club_admin',
    'club-admin',
    'administrator',
    'owner',
    'superuser',
]);
function normalizeRole(role) {
    return String(role !== null && role !== void 0 ? role : '').trim().toLowerCase();
}
function getSessionUserId(req) {
    const raw = req.header('x-user-id');
    if (!raw) {
        return null;
    }
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : null;
}
function isDemoAdmin(req) {
    return req.header('x-user-id') === '0' || ADMIN_ROLES.has(normalizeRole(req.header('x-user-role')));
}
