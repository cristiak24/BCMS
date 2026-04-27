"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PUBLIC_SIGNUP_ROLES = exports.INVITE_DEFAULT_TTL_HOURS = exports.PRIVILEGED_ROLES = void 0;
exports.isPrivilegedRole = isPrivilegedRole;
exports.PRIVILEGED_ROLES = ['superadmin', 'admin', 'coach', 'player'];
exports.INVITE_DEFAULT_TTL_HOURS = 72;
exports.PUBLIC_SIGNUP_ROLES = ['player', 'coach'];
function isPrivilegedRole(role) {
    return exports.PRIVILEGED_ROLES.includes(role);
}
