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
exports.requireSuperadmin = exports.authenticate = void 0;
const firebaseAdmin_1 = require("../lib/firebaseAdmin");
const db_1 = require("../db");
const schema_1 = require("../db/schema");
const drizzle_orm_1 = require("drizzle-orm");
const authenticate = (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: 'Unauthorized: Missing or invalid token' });
        }
        const token = authHeader.split('Bearer ')[1];
        const decodedToken = yield firebaseAdmin_1.firebaseAuth.verifyIdToken(token);
        req.firebaseUser = decodedToken;
        // Fetch user from Postgres
        const userRows = yield db_1.db
            .select()
            .from(schema_1.users)
            .where((0, drizzle_orm_1.or)((0, drizzle_orm_1.eq)(schema_1.users.firebaseUid, decodedToken.uid), (0, drizzle_orm_1.eq)(schema_1.users.uid, decodedToken.uid)))
            .limit(1);
        if (userRows.length > 0) {
            req.user = userRows[0];
        }
        next();
    }
    catch (error) {
        console.error('Authentication error:', error);
        res.status(401).json({ error: 'Unauthorized: Invalid token' });
    }
});
exports.authenticate = authenticate;
const requireSuperadmin = (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    if (!req.user || req.user.role !== 'superadmin') {
        return res.status(403).json({ error: 'Forbidden: Requires superadmin role' });
    }
    next();
});
exports.requireSuperadmin = requireSuperadmin;
