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
const db_1 = require("../db");
const schema_1 = require("../db/schema");
const drizzle_orm_1 = require("drizzle-orm");
/**
 * Resolve the caller from their Firebase ID token.
 *
 * This is the ONLY accepted proof of identity. An earlier revision also trusted
 * `x-user-id` / `x-user-role` / `x-user-club-id` request headers as a fallback,
 * which let any unauthenticated caller impersonate an arbitrary user (or mint a
 * hardcoded admin with `x-user-id: 0`) simply by setting a header. Those headers
 * are now ignored everywhere.
 */
function getBearerAuthenticatedUser(req) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a;
        const authHeader = req.header('authorization');
        if (!(authHeader === null || authHeader === void 0 ? void 0 : authHeader.startsWith('Bearer '))) {
            return null;
        }
        const token = authHeader.slice('Bearer '.length).trim();
        if (!token) {
            return null;
        }
        try {
            const decodedToken = yield firebaseAdmin_1.firebaseAuth.verifyIdToken(token);
            let userRows = yield db_1.db
                .select()
                .from(schema_1.users)
                .where((0, drizzle_orm_1.or)((0, drizzle_orm_1.eq)(schema_1.users.firebaseUid, decodedToken.uid), (0, drizzle_orm_1.eq)(schema_1.users.uid, decodedToken.uid)))
                .limit(1);
            if (userRows.length === 0 && decodedToken.email) {
                const email = decodedToken.email.trim().toLowerCase();
                const emailRows = yield db_1.db
                    .select()
                    .from(schema_1.users)
                    .where((0, drizzle_orm_1.sql) `lower(${schema_1.users.email}) = ${email}`)
                    .limit(1);
                if (emailRows[0]) {
                    userRows = yield db_1.db
                        .update(schema_1.users)
                        .set({
                        firebaseUid: decodedToken.uid,
                        updatedAt: new Date().toISOString(),
                    })
                        .where((0, drizzle_orm_1.eq)(schema_1.users.id, emailRows[0].id))
                        .returning();
                }
            }
            const user = userRows[0];
            if (!user) {
                return null;
            }
            return {
                id: user.id,
                email: user.email,
                name: user.name,
                role: user.role,
                clubId: (_a = user.clubId) !== null && _a !== void 0 ? _a : null,
                status: user.status === 'pending'
                    ? 'pending'
                    : user.status === 'disabled'
                        ? 'rejected'
                        : 'processed',
            };
        }
        catch (_b) {
            return null;
        }
    });
}
function getRequestUser(req) {
    return __awaiter(this, void 0, void 0, function* () {
        return getBearerAuthenticatedUser(req);
    });
}
function requireRequestUser(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        const user = yield getRequestUser(req);
        if (!user) {
            res.status(401).json({ error: 'Authentication required.' });
            return null;
        }
        if (user.status === 'rejected') {
            res.status(403).json({ error: 'This account has been disabled.' });
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
        const normalizedRole = (0, requestAuth_1.normalizeRole)(user.role);
        if (normalizedRole === 'superadmin') {
            return user;
        }
        if (normalizedRole !== 'admin' || user.clubId == null) {
            res.status(403).json({ error: 'Club admin access is required.' });
            return null;
        }
        return user;
    });
}
