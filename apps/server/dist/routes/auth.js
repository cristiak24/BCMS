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
var __rest = (this && this.__rest) || function (s, e) {
    var t = {};
    for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p) && e.indexOf(p) < 0)
        t[p] = s[p];
    if (s != null && typeof Object.getOwnPropertySymbols === "function")
        for (var i = 0, p = Object.getOwnPropertySymbols(s); i < p.length; i++) {
            if (e.indexOf(p[i]) < 0 && Object.prototype.propertyIsEnumerable.call(s, p[i]))
                t[p[i]] = s[p[i]];
        }
    return t;
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const db_1 = require("../db");
const schema_1 = require("../db/schema");
const drizzle_orm_1 = require("drizzle-orm");
const router = (0, express_1.Router)();
// POST /api/auth/login
router.post('/login', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { email, password } = req.body;
        if (!email || !password) {
            return res.status(400).json({ error: 'Email and password are required' });
        }
        // Hardcoded Admin User (Bypass DB)
        if (email === 'admin@test.com' && password === '12341234') {
            return res.json({
                success: true,
                token: "mock-jwt-token-admin",
                user: {
                    id: 0,
                    email: 'admin@test.com',
                    name: 'Admin User',
                    role: 'admin'
                }
            });
        }
        // Cautam utilizatorul in baza de date
        const result = yield db_1.db.select().from(schema_1.users).where((0, drizzle_orm_1.eq)(schema_1.users.email, email)).limit(1);
        const user = result[0];
        if (!user) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }
        // Verificam parola
        if (user.passwordHash !== password) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }
        // Check user status
        // Allow if role is admin OR status is processed
        if (user.role !== 'admin' && user.status !== 'processed') {
            return res.status(403).json({ error: 'Account is pending approval or rejected.' });
        }
        // Returnam succes si datele utilizatorului (fara parola)
        const { passwordHash } = user, userSafe = __rest(user, ["passwordHash"]);
        // Aici s-ar genera un JWT token in mod normal
        const token = "mock-jwt-token-" + user.id;
        res.json({
            success: true,
            token,
            user: userSafe
        });
    }
    catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
}));
// POST /api/auth/signup
router.post('/signup', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { email, password, name } = req.body;
        if (!email || !password || !name) {
            return res.status(400).json({ error: 'Email, password, and name are required' });
        }
        // Check if user exists
        const existingUser = yield db_1.db.select().from(schema_1.users).where((0, drizzle_orm_1.eq)(schema_1.users.email, email)).limit(1);
        if (existingUser.length > 0) {
            return res.status(409).json({ error: 'User already exists' });
        }
        // Create new user with 'pending' status
        const newUser = yield db_1.db.insert(schema_1.users).values({
            email,
            passwordHash: password, // TODO: Hash password
            name,
            role: 'coach', // Default role
            status: 'pending'
        }).returning();
        res.status(201).json({
            success: true,
            user: {
                id: newUser[0].id,
                email: newUser[0].email,
                name: newUser[0].name,
                status: newUser[0].status
            }
        });
    }
    catch (error) {
        console.error('Signup error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
}));
exports.default = router;
