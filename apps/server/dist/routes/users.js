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
// GET /api/users
router.get('/', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const allUsers = yield db_1.db.select({
            id: schema_1.users.id,
            email: schema_1.users.email,
            name: schema_1.users.name,
            role: schema_1.users.role,
        }).from(schema_1.users);
        res.json(allUsers);
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to fetch users' });
    }
}));
// GET /api/users/:id
router.get('/:id', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { id } = req.params;
    try {
        const user = yield db_1.db.select({
            id: schema_1.users.id,
            email: schema_1.users.email,
            name: schema_1.users.name,
            role: schema_1.users.role,
        })
            .from(schema_1.users)
            .where((0, drizzle_orm_1.eq)(schema_1.users.id, Number(id)))
            .limit(1);
        if (user.length === 0) {
            res.status(404).json({ error: 'User not found' });
            return;
        }
        res.json(user[0]);
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to fetch user' });
    }
}));
// PATCH /api/users/:id
router.patch('/:id', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { id } = req.params;
    const { name, role } = req.body;
    try {
        const updated = yield db_1.db
            .update(schema_1.users)
            .set({ name, role })
            .where((0, drizzle_orm_1.eq)(schema_1.users.id, Number(id)))
            .returning({
            id: schema_1.users.id,
            email: schema_1.users.email,
            name: schema_1.users.name,
            role: schema_1.users.role,
        });
        if (updated.length === 0) {
            res.status(404).json({ error: 'User not found' });
            return;
        }
        res.json(updated[0]);
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to update user' });
    }
}));
exports.default = router;
