"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.hashPassword = hashPassword;
exports.verifyPassword = verifyPassword;
exports.splitDisplayName = splitDisplayName;
const crypto_1 = __importDefault(require("crypto"));
const ALGO = 'pbkdf2';
const ITERATIONS = 150000;
const KEY_LENGTH = 64;
const DIGEST = 'sha512';
function toHex(buffer) {
    return buffer.toString('hex');
}
function hashPassword(password) {
    const salt = crypto_1.default.randomBytes(16).toString('hex');
    const derived = crypto_1.default.pbkdf2Sync(password, salt, ITERATIONS, KEY_LENGTH, DIGEST);
    return `${ALGO}$${ITERATIONS}$${salt}$${toHex(derived)}`;
}
function verifyPassword(password, storedValue) {
    if (!storedValue.includes('$')) {
        return password === storedValue;
    }
    const [algo, iterationsRaw, salt, hash] = storedValue.split('$');
    if (algo !== ALGO || !iterationsRaw || !salt || !hash) {
        return password === storedValue;
    }
    const iterations = Number(iterationsRaw);
    if (!Number.isFinite(iterations) || iterations <= 0) {
        return false;
    }
    const candidate = crypto_1.default.pbkdf2Sync(password, salt, iterations, KEY_LENGTH, DIGEST);
    const expected = Buffer.from(hash, 'hex');
    if (candidate.length !== expected.length) {
        return false;
    }
    return crypto_1.default.timingSafeEqual(candidate, expected);
}
function splitDisplayName(fullName) {
    const normalized = String(fullName ?? '').trim().replace(/\s+/g, ' ');
    if (!normalized) {
        return { firstName: '', lastName: '' };
    }
    const [firstName, ...rest] = normalized.split(' ');
    return {
        firstName,
        lastName: rest.join(' '),
    };
}
