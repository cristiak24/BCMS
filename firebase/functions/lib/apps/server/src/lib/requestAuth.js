"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizeRole = normalizeRole;
function normalizeRole(role) {
    return String(role ?? '').trim().toLowerCase();
}
