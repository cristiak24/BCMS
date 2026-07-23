"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const db_1 = require("../db");
const schema_1 = require("../db/schema");
const drizzle_orm_1 = require("drizzle-orm");
const auth_1 = require("../middleware/auth");
const router = (0, express_1.Router)();
async function listUsers() {
    const rows = await db_1.db.select().from(schema_1.users).orderBy((0, drizzle_orm_1.asc)(schema_1.users.id));
    return rows;
}
async function findUserByNumericId(id) {
    const rows = await db_1.db.select().from(schema_1.users).where((0, drizzle_orm_1.eq)(schema_1.users.id, id)).limit(1);
    return rows[0] ?? undefined;
}
async function findUserByUid(uid) {
    const rows = await db_1.db.select().from(schema_1.users).where((0, drizzle_orm_1.eq)(schema_1.users.uid, uid)).limit(1);
    return rows[0] ?? undefined;
}
router.use(auth_1.authenticate);
// GET /api/users/me
router.get('/me', async (req, res) => {
    try {
        const uid = req.firebaseUser?.uid;
        const user = req.user ?? (uid ? await findUserByUid(uid) : null);
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
});
// GET /api/users
router.get('/', (0, auth_1.requireRoles)(['admin']), async (_req, res) => {
    try {
        const allUsers = await listUsers();
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
});
// GET /api/users/:id
router.get('/:id', (0, auth_1.requireRoles)(['admin']), async (req, res) => {
    const id = Number(req.params.id);
    if (Number.isNaN(id)) {
        res.status(400).json({ error: 'Invalid user id' });
        return;
    }
    try {
        const user = await findUserByNumericId(id);
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
});
// PATCH /api/users/:id
router.patch('/:id', (0, auth_1.requireRoles)(['admin']), async (req, res) => {
    const id = Number(req.params.id);
    const { name, role } = req.body;
    if (Number.isNaN(id)) {
        res.status(400).json({ error: 'Invalid user id' });
        return;
    }
    try {
        const user = await findUserByNumericId(id);
        if (!user) {
            res.status(404).json({ error: 'User not found' });
            return;
        }
        const nextUser = {
            ...(typeof name === 'string' ? { name } : {}),
            ...(typeof role === 'string' ? { role: role } : {}),
        };
        const updatedRows = await db_1.db.update(schema_1.users).set(nextUser).where((0, drizzle_orm_1.eq)(schema_1.users.id, user.id)).returning();
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
});
exports.default = router;
