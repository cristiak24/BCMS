"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getRequestUser = getRequestUser;
exports.requireRequestUser = requireRequestUser;
exports.requireClubAdmin = requireClubAdmin;
const requestAuth_1 = require("./requestAuth");
const firebaseAdmin_1 = require("./firebaseAdmin");
const firebaseAdmin_2 = require("./firebaseAdmin");
const db_1 = require("../db");
const schema_1 = require("../db/schema");
const drizzle_orm_1 = require("drizzle-orm");
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
function canUseFirestoreDocuments() {
    return Boolean(process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim() ||
        (process.env.FIREBASE_CLIENT_EMAIL?.trim() && process.env.FIREBASE_PRIVATE_KEY?.trim()) ||
        process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim() ||
        process.env.K_SERVICE ||
        process.env.FUNCTION_TARGET);
}
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
        const decodedToken = await firebaseAdmin_2.firebaseAuth.verifyIdToken(token);
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
    const bearerUser = await getBearerAuthenticatedUser(req);
    if (bearerUser) {
        return bearerUser;
    }
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
    let user = null;
    if (canUseFirestoreDocuments()) {
        try {
            user = userId != null
                ? await (0, firebaseAdmin_1.fetchDocByNumericId)('users', userId)
                : rawUserId
                    ? await (0, firebaseAdmin_1.fetchDocById)('users', rawUserId)
                    : null;
        }
        catch {
            user = null;
        }
    }
    if (!user && userId != null) {
        const userRows = await db_1.db
            .select()
            .from(schema_1.users)
            .where((0, drizzle_orm_1.eq)(schema_1.users.id, userId))
            .limit(1);
        user = userRows[0] ?? null;
    }
    if (!user && rawUserId) {
        const userRows = await db_1.db
            .select()
            .from(schema_1.users)
            .where((0, drizzle_orm_1.or)((0, drizzle_orm_1.eq)(schema_1.users.firebaseUid, rawUserId), (0, drizzle_orm_1.eq)(schema_1.users.uid, rawUserId)))
            .limit(1);
        user = userRows[0] ?? null;
    }
    if (!user) {
        return null;
    }
    return {
        id: typeof user.id === 'number' ? user.id : Number(user.id) || 0,
        email: user.email,
        name: user.name,
        role: user.role,
        clubId: user.clubId ?? clubId,
        status: user.status === 'active' ? 'processed' : user.status === 'disabled' ? 'rejected' : user.status,
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
