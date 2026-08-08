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
const express_1 = require("express");
const db_1 = require("../db");
const schema_1 = require("../db/schema");
const drizzle_orm_1 = require("drizzle-orm");
const auth_1 = require("../middleware/auth");
const router = (0, express_1.Router)();
/**
 * Roles a club admin is allowed to assign. Granting `admin` or `superadmin` is
 * reserved for a superadmin: otherwise any club admin could promote themselves
 * (or a colleague) to full platform access through this endpoint.
 */
const ADMIN_ASSIGNABLE_ROLES = new Set(['player', 'parent', 'coach', 'staff', 'accountant']);
const SUPERADMIN_ASSIGNABLE_ROLES = new Set([...ADMIN_ASSIGNABLE_ROLES, 'admin', 'superadmin']);
function isSuperadmin(req) {
    var _a;
    return ((_a = req.user) === null || _a === void 0 ? void 0 : _a.role) === 'superadmin';
}
function getRequestClubId(req) {
    var _a;
    return ((_a = req.user) === null || _a === void 0 ? void 0 : _a.clubId) == null ? null : Number(req.user.clubId);
}
function findUserByUid(uid) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a;
        const rows = yield db_1.db.select().from(schema_1.users).where((0, drizzle_orm_1.eq)(schema_1.users.uid, uid)).limit(1);
        return (_a = rows[0]) !== null && _a !== void 0 ? _a : undefined;
    });
}
/**
 * Load a user the caller is actually allowed to see.
 *
 * A club admin may only reach accounts inside their own club. Previously every
 * handler here loaded users by raw id with no club check, so a club admin could
 * read — and rewrite — any account on the platform, including the superadmin's.
 */
function findAccessibleUser(req, id) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b;
        if (isSuperadmin(req)) {
            const rows = yield db_1.db.select().from(schema_1.users).where((0, drizzle_orm_1.eq)(schema_1.users.id, id)).limit(1);
            return (_a = rows[0]) !== null && _a !== void 0 ? _a : undefined;
        }
        const clubId = getRequestClubId(req);
        if (clubId == null) {
            return undefined;
        }
        const rows = yield db_1.db
            .select()
            .from(schema_1.users)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.users.id, id), (0, drizzle_orm_1.eq)(schema_1.users.clubId, clubId)))
            .limit(1);
        return (_b = rows[0]) !== null && _b !== void 0 ? _b : undefined;
    });
}
router.use(auth_1.authenticate);
// GET /api/users/me
router.get('/me', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    try {
        const uid = (_a = req.firebaseUser) === null || _a === void 0 ? void 0 : _a.uid;
        const user = (_b = req.user) !== null && _b !== void 0 ? _b : (uid ? yield findUserByUid(uid) : null);
        if (!user) {
            return res.status(404).json({ error: 'User profile not found' });
        }
        res.json({
            id: user.id,
            uid: user.uid,
            email: user.email,
            name: user.name,
            firstName: user.firstName,
            lastName: user.lastName,
            role: user.role,
            clubId: user.clubId,
            status: user.status,
            avatarUrl: user.avatarUrl,
            createdAt: user.createdAt,
        });
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to fetch user profile' });
    }
}));
// GET /api/users
router.get('/', (0, auth_1.requireRoles)(['admin']), (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const clubId = getRequestClubId(req);
        if (!isSuperadmin(req) && clubId == null) {
            return res.status(403).json({ error: 'Your account is not assigned to a club.' });
        }
        // Scope the query in SQL rather than fetching every row and filtering.
        const rows = isSuperadmin(req)
            ? yield db_1.db.select().from(schema_1.users).orderBy((0, drizzle_orm_1.asc)(schema_1.users.id))
            : yield db_1.db.select().from(schema_1.users).where((0, drizzle_orm_1.eq)(schema_1.users.clubId, clubId)).orderBy((0, drizzle_orm_1.asc)(schema_1.users.id));
        res.json(rows.map((user) => ({
            id: user.id,
            email: user.email,
            name: user.name,
            role: user.role,
        })));
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to fetch users' });
    }
}));
// GET /api/users/:id
router.get('/:id', (0, auth_1.requireRoles)(['admin']), (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const id = Number(req.params.id);
    if (Number.isNaN(id)) {
        res.status(400).json({ error: 'Invalid user id' });
        return;
    }
    try {
        const user = yield findAccessibleUser(req, id);
        if (!user) {
            res.status(404).json({ error: 'User not found' });
            return;
        }
        res.json({
            id: user.id,
            email: user.email,
            name: user.name,
            role: user.role,
        });
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to fetch user' });
    }
}));
// PATCH /api/users/:id
router.patch('/:id', (0, auth_1.requireRoles)(['admin']), (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const id = Number(req.params.id);
    const { name, role } = req.body;
    if (Number.isNaN(id)) {
        res.status(400).json({ error: 'Invalid user id' });
        return;
    }
    try {
        const user = yield findAccessibleUser(req, id);
        if (!user) {
            res.status(404).json({ error: 'User not found' });
            return;
        }
        if (role !== undefined) {
            if (typeof role !== 'string') {
                res.status(400).json({ error: 'role must be a string.' });
                return;
            }
            const assignable = isSuperadmin(req) ? SUPERADMIN_ASSIGNABLE_ROLES : ADMIN_ASSIGNABLE_ROLES;
            if (!assignable.has(role)) {
                res.status(403).json({ error: 'You are not allowed to assign this role.' });
                return;
            }
            // A club admin must not be able to demote or re-role an existing
            // admin/superadmin account, only manage ordinary club members.
            if (!isSuperadmin(req) && (user.role === 'admin' || user.role === 'superadmin')) {
                res.status(403).json({ error: 'You are not allowed to change the role of an administrator.' });
                return;
            }
            // Nobody changes their own role through this endpoint.
            if (user.id === ((_a = req.user) === null || _a === void 0 ? void 0 : _a.id)) {
                res.status(403).json({ error: 'You cannot change your own role.' });
                return;
            }
        }
        if (name !== undefined && typeof name !== 'string') {
            res.status(400).json({ error: 'name must be a string.' });
            return;
        }
        const trimmedName = typeof name === 'string' ? name.trim() : undefined;
        if (trimmedName !== undefined && (trimmedName.length === 0 || trimmedName.length > 120)) {
            res.status(400).json({ error: 'name must be between 1 and 120 characters.' });
            return;
        }
        const nextUser = Object.assign(Object.assign({}, (trimmedName !== undefined ? { name: trimmedName } : {})), (typeof role === 'string' ? { role: role } : {}));
        if (Object.keys(nextUser).length === 0) {
            res.status(400).json({ error: 'No updatable fields were provided.' });
            return;
        }
        const updatedRows = yield db_1.db.update(schema_1.users).set(nextUser).where((0, drizzle_orm_1.eq)(schema_1.users.id, user.id)).returning();
        const updatedUser = updatedRows[0];
        res.json({
            id: updatedUser.id,
            email: updatedUser.email,
            name: updatedUser.name,
            role: updatedUser.role,
        });
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to update user' });
    }
}));
exports.default = router;
