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
const firebaseAdmin_1 = require("../lib/firebaseAdmin");
const db_1 = require("../db");
const schema_1 = require("../db/schema");
const drizzle_orm_1 = require("drizzle-orm");
const requestContext_1 = require("../lib/requestContext");
const requestAuth_1 = require("../lib/requestAuth");
const router = (0, express_1.Router)();
function normalizeStatus(status) {
    return String(status !== null && status !== void 0 ? status : '').trim().toLowerCase();
}
function isPaidStatus(status) {
    const normalized = normalizeStatus(status);
    return normalized === 'paid' || normalized === 'processed' || normalized === 'succeeded' || normalized === 'success';
}
function isPresentStatus(status) {
    const normalized = normalizeStatus(status);
    return normalized === 'present' || normalized === 'late' || normalized === 'medical' || normalized === 'excused';
}
function amountOf(value) {
    const amount = Number(value !== null && value !== void 0 ? value : 0);
    return Number.isFinite(amount) ? amount : 0;
}
function canUseFirestoreDocuments() {
    var _a, _b, _c, _d;
    return Boolean(((_a = process.env.FIREBASE_SERVICE_ACCOUNT_JSON) === null || _a === void 0 ? void 0 : _a.trim()) ||
        (((_b = process.env.FIREBASE_CLIENT_EMAIL) === null || _b === void 0 ? void 0 : _b.trim()) && ((_c = process.env.FIREBASE_PRIVATE_KEY) === null || _c === void 0 ? void 0 : _c.trim())) ||
        ((_d = process.env.GOOGLE_APPLICATION_CREDENTIALS) === null || _d === void 0 ? void 0 : _d.trim()) ||
        process.env.K_SERVICE ||
        process.env.FUNCTION_TARGET);
}
function getFirestoreDocs(collectionName) {
    return __awaiter(this, void 0, void 0, function* () {
        if (!canUseFirestoreDocuments()) {
            return [];
        }
        try {
            const snap = yield firebaseAdmin_1.firestore.collection(collectionName).get();
            return snap.docs;
        }
        catch (error) {
            console.error(`[dashboard/summary] Firestore ${collectionName} fallback:`, error);
            return [];
        }
    });
}
function resolveDashboardScope(req) {
    return __awaiter(this, void 0, void 0, function* () {
        const user = yield (0, requestContext_1.getRequestUser)(req);
        const role = (0, requestAuth_1.normalizeRole)(user === null || user === void 0 ? void 0 : user.role);
        if (!user || role === 'superadmin' || user.clubId == null) {
            return { clubId: null, teamIds: null };
        }
        const clubId = Number(user.clubId);
        const teamRows = yield db_1.db.select({ id: schema_1.teams.id }).from(schema_1.teams).where((0, drizzle_orm_1.eq)(schema_1.teams.clubId, clubId));
        return {
            clubId,
            teamIds: teamRows.map((team) => team.id),
        };
    });
}
function getScopedPostgresPlayers(clubId, teamIds) {
    return __awaiter(this, void 0, void 0, function* () {
        if (clubId == null) {
            return db_1.db.select().from(schema_1.players);
        }
        const playersById = new Map();
        if (teamIds === null || teamIds === void 0 ? void 0 : teamIds.length) {
            const directPlayers = yield db_1.db.select().from(schema_1.players).where((0, drizzle_orm_1.inArray)(schema_1.players.teamId, teamIds));
            const relationRows = yield db_1.db
                .select({ player: schema_1.players })
                .from(schema_1.playersToTeams)
                .innerJoin(schema_1.players, (0, drizzle_orm_1.eq)(schema_1.playersToTeams.playerId, schema_1.players.id))
                .where((0, drizzle_orm_1.inArray)(schema_1.playersToTeams.teamId, teamIds));
            directPlayers.forEach((player) => playersById.set(player.id, player));
            relationRows.forEach((row) => playersById.set(row.player.id, row.player));
        }
        const clubUserRows = yield db_1.db.select({ email: schema_1.users.email }).from(schema_1.users).where((0, drizzle_orm_1.eq)(schema_1.users.clubId, clubId));
        const clubUserEmails = clubUserRows.map((user) => user.email.trim().toLowerCase());
        if (clubUserEmails.length) {
            const userPlayers = yield db_1.db.select().from(schema_1.players).where((0, drizzle_orm_1.inArray)(schema_1.players.email, clubUserEmails));
            userPlayers.forEach((player) => playersById.set(player.id, player));
        }
        return Array.from(playersById.values());
    });
}
router.get('/summary', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    try {
        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
        const scope = yield resolveDashboardScope(req);
        const scopedPlayers = yield getScopedPostgresPlayers(scope.clubId, scope.teamIds);
        const scopedPlayerIds = scopedPlayers.map((player) => player.id);
        const [playerDocs, teamDocs, financialDocDocs, paymentDocs, attendanceDocs] = yield Promise.all([
            getFirestoreDocs('players'),
            getFirestoreDocs('teams'),
            getFirestoreDocs('financialDocuments'),
            getFirestoreDocs('playerPayments'),
            getFirestoreDocs('attendance'),
        ]);
        const pgFinancialDocs = yield db_1.db.select().from(schema_1.financialDocuments);
        const pgPaymentRows = scopedPlayerIds.length
            ? yield db_1.db.select().from(schema_1.playerPayments).where((0, drizzle_orm_1.inArray)(schema_1.playerPayments.playerId, scopedPlayerIds))
            : [];
        const pgAttendanceRows = scopedPlayerIds.length
            ? yield db_1.db.select().from(schema_1.attendance).where((0, drizzle_orm_1.inArray)(schema_1.attendance.playerId, scopedPlayerIds))
            : [];
        const postgresActivePlayerCount = scopedPlayers.filter((player) => { var _a; return normalizeStatus((_a = player.status) !== null && _a !== void 0 ? _a : 'active') === 'active'; }).length;
        const firestoreActivePlayerCount = playerDocs.filter((docSnap) => { var _a; return normalizeStatus((_a = docSnap.data().status) !== null && _a !== void 0 ? _a : 'active') === 'active'; }).length;
        const activePlayerCount = scopedPlayers.length > 0 ? postgresActivePlayerCount : firestoreActivePlayerCount;
        const teamCount = (_b = (_a = scope.teamIds) === null || _a === void 0 ? void 0 : _a.length) !== null && _b !== void 0 ? _b : teamDocs.length;
        const financialDocs = financialDocDocs.map((docSnap) => docSnap.data());
        const firestoreDocumentIncome = financialDocs
            .filter((doc) => normalizeStatus(doc.status) === 'processed')
            .reduce((sum, doc) => { var _a; return sum + Number((_a = doc.amount) !== null && _a !== void 0 ? _a : 0); }, 0);
        const firestoreMonthlyDocumentIncome = financialDocs
            .filter((doc) => normalizeStatus(doc.status) === 'processed')
            .filter((doc) => {
            const date = (0, firebaseAdmin_1.toDate)(doc.date);
            return date ? date >= startOfMonth && date <= endOfMonth : false;
        })
            .reduce((sum, doc) => { var _a; return sum + Number((_a = doc.amount) !== null && _a !== void 0 ? _a : 0); }, 0);
        const firestorePaidPayments = paymentDocs
            .map((docSnap) => docSnap.data())
            .filter((payment) => isPaidStatus(payment.status));
        const firestorePaymentIncome = firestorePaidPayments.reduce((sum, payment) => sum + amountOf(payment.amount), 0);
        const firestoreMonthlyPaymentIncome = firestorePaidPayments
            .filter((payment) => {
            var _a;
            const date = (0, firebaseAdmin_1.toDate)((_a = payment.date) !== null && _a !== void 0 ? _a : payment.createdAt);
            return date ? date >= startOfMonth && date <= endOfMonth : false;
        })
            .reduce((sum, payment) => sum + amountOf(payment.amount), 0);
        const postgresDocumentIncome = pgFinancialDocs
            .filter((doc) => normalizeStatus(doc.status) === 'processed')
            .reduce((sum, doc) => sum + amountOf(doc.amount), 0);
        const postgresMonthlyDocumentIncome = pgFinancialDocs
            .filter((doc) => normalizeStatus(doc.status) === 'processed')
            .filter((doc) => {
            const date = (0, firebaseAdmin_1.toDate)(doc.date);
            return date ? date >= startOfMonth && date <= endOfMonth : false;
        })
            .reduce((sum, doc) => sum + amountOf(doc.amount), 0);
        const postgresPaymentIncome = pgPaymentRows
            .filter((payment) => isPaidStatus(payment.status))
            .reduce((sum, payment) => sum + amountOf(payment.amount), 0);
        const postgresMonthlyPaymentIncome = pgPaymentRows
            .filter((payment) => isPaidStatus(payment.status))
            .filter((payment) => {
            var _a;
            const date = (0, firebaseAdmin_1.toDate)((_a = payment.date) !== null && _a !== void 0 ? _a : payment.createdAt);
            return date ? date >= startOfMonth && date <= endOfMonth : false;
        })
            .reduce((sum, payment) => sum + amountOf(payment.amount), 0);
        const totalIncome = postgresDocumentIncome + postgresPaymentIncome + firestoreDocumentIncome + firestorePaymentIncome;
        const monthlyIncome = postgresMonthlyDocumentIncome + postgresMonthlyPaymentIncome + firestoreMonthlyDocumentIncome + firestoreMonthlyPaymentIncome;
        const pendingPaymentsCount = paymentDocs.filter((docSnap) => { var _a; return normalizeStatus((_a = docSnap.data().status) !== null && _a !== void 0 ? _a : 'pending') === 'pending'; }).length
            + pgPaymentRows.filter((row) => { var _a; return normalizeStatus((_a = row.status) !== null && _a !== void 0 ? _a : 'pending') === 'pending'; }).length;
        const attendanceRows = attendanceDocs.map((docSnap) => docSnap.data());
        const firestorePresentCount = attendanceRows.filter((row) => {
            const date = (0, firebaseAdmin_1.toDate)(row.date);
            return isPresentStatus(row.status) && date ? date >= startOfMonth && date <= endOfMonth : false;
        }).length;
        const firestoreAttendanceRecords = attendanceRows.filter((row) => {
            const date = (0, firebaseAdmin_1.toDate)(row.date);
            return date ? date >= startOfMonth && date <= endOfMonth : false;
        });
        const postgresMonthlyAttendanceRows = pgAttendanceRows.filter((row) => {
            const date = (0, firebaseAdmin_1.toDate)(row.date);
            return date ? date >= startOfMonth && date <= endOfMonth : false;
        });
        const presentCount = firestorePresentCount + postgresMonthlyAttendanceRows.filter((row) => isPresentStatus(row.status)).length;
        const totalAttendanceRecords = firestoreAttendanceRecords.length + postgresMonthlyAttendanceRows.length;
        const attendanceRate = totalAttendanceRecords > 0
            ? Math.round((presentCount / totalAttendanceRecords) * 100)
            : null;
        const todayTs = new Date();
        const in30Days = new Date();
        in30Days.setDate(todayTs.getDate() + 30);
        const expiredVisasItems = playerDocs
            .map((docSnap) => docSnap.data())
            .filter((player) => {
            const expiry = (0, firebaseAdmin_1.toDate)(player.medicalCheckExpiry);
            return expiry ? expiry.getTime() <= todayTs.getTime() : false;
        });
        const expiringItems = playerDocs
            .map((docSnap) => docSnap.data())
            .filter((player) => {
            const expiry = (0, firebaseAdmin_1.toDate)(player.medicalCheckExpiry);
            return expiry ? expiry >= todayTs && expiry <= in30Days : false;
        })
            .map((player) => {
            var _a, _b;
            const expiry = (0, firebaseAdmin_1.toDate)(player.medicalCheckExpiry);
            const daysLeft = expiry ? Math.ceil((expiry.getTime() - todayTs.getTime()) / 86400000) : null;
            return {
                type: 'VIZĂ MEDICALĂ',
                name: `${(_a = player.firstName) !== null && _a !== void 0 ? _a : ''} ${(_b = player.lastName) !== null && _b !== void 0 ? _b : ''}`.trim(),
                daysLeft,
                expiryDate: expiry ? expiry.toLocaleDateString('ro-RO') : '',
                urgent: daysLeft !== null && daysLeft <= 7,
            };
        });
        res.json({
            activePlayerCount,
            teamCount,
            totalIncome,
            monthlyIncome,
            pendingPaymentsCount,
            attendanceRate,
            presentCount,
            totalAttendanceRecords,
            expiredVisasCount: expiredVisasItems.length,
            expiringItems,
        });
    }
    catch (e) {
        console.error('[dashboard/summary] error:', e);
        res.status(500).json({ error: 'Failed to fetch dashboard summary' });
    }
}));
exports.default = router;
