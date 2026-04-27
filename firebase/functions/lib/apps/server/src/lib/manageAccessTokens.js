"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizeRefreshIntervalMinutes = normalizeRefreshIntervalMinutes;
exports.generateInviteToken = generateInviteToken;
exports.hashInviteToken = hashInviteToken;
exports.isInviteExpired = isInviteExpired;
const crypto_1 = __importDefault(require("crypto"));
const firebaseAdmin_1 = require("./firebaseAdmin");
function normalizeRefreshIntervalMinutes(input) {
    const minutes = Number.isFinite(input) ? Math.floor(Number(input)) : 30;
    if (minutes < 5) {
        return 5;
    }
    if (minutes > 24 * 60) {
        return 24 * 60;
    }
    return minutes;
}
function generateInviteToken(role, refreshIntervalMinutes = 30) {
    const interval = normalizeRefreshIntervalMinutes(refreshIntervalMinutes);
    const rawToken = crypto_1.default.randomBytes(32).toString('hex');
    const tokenHash = hashInviteToken(rawToken);
    const expiresAt = new Date(Date.now() + interval * 60 * 1000);
    return {
        rawToken,
        tokenHash,
        role,
        expiresAt,
    };
}
function hashInviteToken(rawToken) {
    return crypto_1.default.createHash('sha256').update(rawToken).digest('hex');
}
function isInviteExpired(expiresAt) {
    const iso = (0, firebaseAdmin_1.toIso)(expiresAt);
    return iso ? new Date(iso).getTime() <= Date.now() : true;
}
