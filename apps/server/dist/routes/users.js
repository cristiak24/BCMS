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
const router = (0, express_1.Router)();
function listUsers() {
    return __awaiter(this, void 0, void 0, function* () {
        const rows = yield db_1.db.select().from(schema_1.users).orderBy((0, drizzle_orm_1.asc)(schema_1.users.id));
        return rows;
    });
}
function findUserByNumericId(id) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a;
        const rows = yield db_1.db.select().from(schema_1.users).where((0, drizzle_orm_1.eq)(schema_1.users.id, id)).limit(1);
        return (_a = rows[0]) !== null && _a !== void 0 ? _a : undefined;
    });
}
function findUserByUid(uid) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a;
        const rows = yield db_1.db.select().from(schema_1.users).where((0, drizzle_orm_1.eq)(schema_1.users.uid, uid)).limit(1);
        return (_a = rows[0]) !== null && _a !== void 0 ? _a : undefined;
    });
}
// GET /api/users/me
router.get('/me', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    // Usually set by auth middleware, but we can also check headers
    const uid = req.headers['x-user-uid'] || req.headers['x-user-id'];
    if (!uid) {
        return res.status(401).json({ error: 'Unauthorized: missing uid' });
    }
    try {
        let user;
        // Check if uid is a numeric string (id) or a firebase uid
        if (!isNaN(Number(uid)) && String(Number(uid)) === uid) {
            user = yield findUserByNumericId(Number(uid));
        }
        else {
            user = yield findUserByUid(uid);
        }
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
router.get('/', (_req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const allUsers = yield listUsers();
        res.json(allUsers.map((user) => ({
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
router.get('/:id', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const id = Number(req.params.id);
    if (Number.isNaN(id)) {
        res.status(400).json({ error: 'Invalid user id' });
        return;
    }
    try {
        const user = yield findUserByNumericId(id);
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
router.patch('/:id', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const id = Number(req.params.id);
    const { name, role } = req.body;
    if (Number.isNaN(id)) {
        res.status(400).json({ error: 'Invalid user id' });
        return;
    }
    try {
        const user = yield findUserByNumericId(id);
        if (!user) {
            res.status(404).json({ error: 'User not found' });
            return;
        }
        const nextUser = Object.assign(Object.assign({}, (typeof name === 'string' ? { name } : {})), (typeof role === 'string' ? { role: role } : {}));
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
