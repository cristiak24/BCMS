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
const router = (0, express_1.Router)();
router.get('/summary', (_req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
        const playersSnap = yield firebaseAdmin_1.firestore.collection('players').get();
        const teamsSnap = yield firebaseAdmin_1.firestore.collection('teams').get();
        const financialDocsSnap = yield firebaseAdmin_1.firestore.collection('financialDocuments').get();
        const paymentsSnap = yield firebaseAdmin_1.firestore.collection('playerPayments').get();
        const attendanceSnap = yield firebaseAdmin_1.firestore.collection('attendance').get();
        const activePlayerCount = playersSnap.docs.filter((docSnap) => { var _a; return ((_a = docSnap.data().status) !== null && _a !== void 0 ? _a : 'active') === 'active'; }).length;
        const teamCount = teamsSnap.size;
        const financialDocs = financialDocsSnap.docs.map((docSnap) => docSnap.data());
        const totalIncome = financialDocs
            .filter((doc) => doc.status === 'processed')
            .reduce((sum, doc) => { var _a; return sum + Number((_a = doc.amount) !== null && _a !== void 0 ? _a : 0); }, 0);
        const monthlyIncome = financialDocs
            .filter((doc) => doc.status === 'processed')
            .filter((doc) => {
            const date = (0, firebaseAdmin_1.toDate)(doc.date);
            return date ? date >= startOfMonth && date <= endOfMonth : false;
        })
            .reduce((sum, doc) => { var _a; return sum + Number((_a = doc.amount) !== null && _a !== void 0 ? _a : 0); }, 0);
        const pendingPaymentsCount = paymentsSnap.docs.filter((docSnap) => { var _a; return ((_a = docSnap.data().status) !== null && _a !== void 0 ? _a : 'pending') === 'pending'; }).length;
        const attendanceRows = attendanceSnap.docs.map((docSnap) => docSnap.data());
        const presentCount = attendanceRows.filter((row) => {
            const date = (0, firebaseAdmin_1.toDate)(row.date);
            return (row.status === 'present') && date ? date >= startOfMonth && date <= endOfMonth : false;
        }).length;
        const totalAttendanceRecords = attendanceRows.filter((row) => {
            const date = (0, firebaseAdmin_1.toDate)(row.date);
            return date ? date >= startOfMonth && date <= endOfMonth : false;
        }).length;
        const attendanceRate = totalAttendanceRecords > 0
            ? Math.round((presentCount / totalAttendanceRecords) * 100)
            : null;
        const todayTs = new Date();
        const in30Days = new Date();
        in30Days.setDate(todayTs.getDate() + 30);
        const expiredVisasItems = playersSnap.docs
            .map((docSnap) => docSnap.data())
            .filter((player) => {
            const expiry = (0, firebaseAdmin_1.toDate)(player.medicalCheckExpiry);
            return expiry ? expiry.getTime() <= todayTs.getTime() : false;
        });
        const expiringItems = playersSnap.docs
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
