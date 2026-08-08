"use strict";
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
async function getBearerAuthenticatedUser(req) {
    const authHeader = req.header('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
        return null;
    }
    const token = authHeader.slice('Bearer '.length).trim();
    if (!token) {
        return null;
    }
    try {
        const decodedToken = await firebaseAdmin_1.firebaseAuth.verifyIdToken(token);
        let userRows = await db_1.db
            .select()
            .from(schema_1.users)
            .where((0, drizzle_orm_1.or)((0, drizzle_orm_1.eq)(schema_1.users.firebaseUid, decodedToken.uid), (0, drizzle_orm_1.eq)(schema_1.users.uid, decodedToken.uid)))
            .limit(1);
        if (userRows.length === 0 && decodedToken.email) {
            const email = decodedToken.email.trim().toLowerCase();
            const emailRows = await db_1.db
                .select()
                .from(schema_1.users)
                .where((0, drizzle_orm_1.sql) `lower(${schema_1.users.email}) = ${email}`)
                .limit(1);
            if (emailRows[0]) {
                userRows = await db_1.db
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
            clubId: user.clubId ?? null,
            status: user.status === 'pending'
                ? 'pending'
                : user.status === 'disabled'
                    ? 'rejected'
                    : 'processed',
        };
    }
    catch {
        return null;
    }
}
async function getRequestUser(req) {
    return getBearerAuthenticatedUser(req);
}
async function requireRequestUser(req, res) {
    const user = await getRequestUser(req);
    if (!user) {
        res.status(401).json({ error: 'Authentication required.' });
        return null;
    }
    if (user.status === 'rejected') {
        res.status(403).json({ error: 'This account has been disabled.' });
        return null;
    }
    return user;
}
async function requireClubAdmin(req, res) {
    const user = await requireRequestUser(req, res);
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
}
