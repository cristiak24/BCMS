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
exports.playersController = void 0;
const firebaseAdmin_1 = require("../lib/firebaseAdmin");
function normalizePaymentStatus(status) {
    return (status || '').trim().toLowerCase();
}
function isPaidStatus(status) {
    const normalized = normalizePaymentStatus(status);
    return normalized === 'paid' || normalized === 'processed';
}
function isAttendancePresent(status) {
    const normalized = (status || '').trim().toLowerCase();
    return normalized === 'present' || normalized === 'late' || normalized === 'medical' || normalized === 'excused';
}
function isMoreRecentPayment(a, b) {
    var _a, _b, _c, _d;
    if (a.year !== b.year)
        return a.year > b.year;
    if (a.month !== b.month)
        return a.month > b.month;
    return ((_b = (_a = (0, firebaseAdmin_1.toDate)(a.createdAt)) === null || _a === void 0 ? void 0 : _a.getTime()) !== null && _b !== void 0 ? _b : 0) > ((_d = (_c = (0, firebaseAdmin_1.toDate)(b.createdAt)) === null || _c === void 0 ? void 0 : _c.getTime()) !== null && _d !== void 0 ? _d : 0);
}
function buildRosterRows() {
    return __awaiter(this, void 0, void 0, function* () {
        const playersSnap = yield firebaseAdmin_1.firestore.collection('players').get();
        const allPlayers = playersSnap.docs.map((docSnap) => docSnap.data());
        if (!allPlayers.length) {
            return [];
        }
        const playerIds = allPlayers.map((p) => p.id);
        const membershipsSnap = yield firebaseAdmin_1.firestore.collection('playersToTeams').get();
        const membershipRows = membershipsSnap.docs
            .map((docSnap) => docSnap.data())
            .filter((row) => playerIds.includes(row.playerId));
        const teamsSnap = yield firebaseAdmin_1.firestore.collection('teams').get();
        const teamsById = new Map();
        teamsSnap.docs.forEach((docSnap) => {
            const team = docSnap.data();
            teamsById.set(team.id, team);
        });
        const attendanceSnap = yield firebaseAdmin_1.firestore.collection('attendance').get();
        const attendanceRows = attendanceSnap.docs
            .map((docSnap) => docSnap.data())
            .filter((row) => playerIds.includes(row.playerId));
        const paymentSnap = yield firebaseAdmin_1.firestore.collection('playerPayments').get();
        const paymentRows = paymentSnap.docs
            .map((docSnap) => docSnap.data())
            .filter((row) => playerIds.includes(row.playerId));
        const teamsByPlayer = new Map();
        for (const row of membershipRows) {
            const team = teamsById.get(row.teamId);
            if (!team) {
                continue;
            }
            const list = teamsByPlayer.get(row.playerId) || [];
            list.push({ name: team.name, leagueName: team.leagueName || '' });
            teamsByPlayer.set(row.playerId, list);
        }
        const attendanceByPlayer = new Map();
        for (const row of attendanceRows) {
            const curr = attendanceByPlayer.get(row.playerId) || { present: 0, total: 0 };
            curr.total += 1;
            if (isAttendancePresent(row.status)) {
                curr.present += 1;
            }
            attendanceByPlayer.set(row.playerId, curr);
        }
        const latestPaymentByPlayer = new Map();
        for (const row of paymentRows) {
            const current = latestPaymentByPlayer.get(row.playerId);
            if (!current || isMoreRecentPayment(row, current)) {
                latestPaymentByPlayer.set(row.playerId, row);
            }
        }
        return allPlayers.map((player) => {
            var _a, _b, _c;
            const firstName = player.firstName || ((_a = player.name) === null || _a === void 0 ? void 0 : _a.split(' ')[0]) || 'Unknown';
            const lastName = player.lastName || ((_b = player.name) === null || _b === void 0 ? void 0 : _b.split(' ').slice(1).join(' ')) || 'Player';
            const playerTeams = teamsByPlayer.get(player.id) || [];
            const sortedTeams = [...playerTeams].sort((a, b) => b.name.localeCompare(a.name));
            const category = ((_c = sortedTeams[0]) === null || _c === void 0 ? void 0 : _c.name) || 'Unassigned';
            const teamNames = playerTeams.map((team) => team.name);
            const attendanceStats = attendanceByPlayer.get(player.id);
            const attendanceRate = attendanceStats && attendanceStats.total > 0
                ? Math.round((attendanceStats.present / attendanceStats.total) * 100)
                : 0;
            const latestPayment = latestPaymentByPlayer.get(player.id);
            const paymentStatus = (latestPayment === null || latestPayment === void 0 ? void 0 : latestPayment.status) || 'pending';
            return Object.assign(Object.assign({}, player), { firstName,
                lastName,
                category,
                attendanceRate,
                paymentStatus, teamName: teamNames[0] || 'Unassigned', teamNames });
        });
    });
}
function computeAttendanceRateFromRecords(records) {
    if (records.length === 0) {
        return null;
    }
    const present = records.filter((record) => isAttendancePresent(record.status)).length;
    return Math.round((present / records.length) * 1000) / 10;
}
exports.playersController = {
    searchPlayers(req, res) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const { query } = req.query;
                if (!query || typeof query !== 'string') {
                    return res.status(400).json({ error: 'Search query is required' });
                }
                const playersSnap = yield firebaseAdmin_1.firestore.collection('players').get();
                const results = playersSnap.docs
                    .map((docSnap) => docSnap.data())
                    .filter((player) => {
                    var _a, _b;
                    const haystack = `${(_a = player.firstName) !== null && _a !== void 0 ? _a : ''} ${(_b = player.lastName) !== null && _b !== void 0 ? _b : ''}`.toLowerCase();
                    return haystack.includes(query.toLowerCase());
                });
                res.json(results);
            }
            catch (error) {
                console.error('Search players error:', error);
                res.status(500).json({ error: 'Internal server error' });
            }
        });
    },
    getRoster(_req, res) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const rosterWithData = yield buildRosterRows();
                res.json(rosterWithData);
            }
            catch (error) {
                console.error('Get roster error:', error);
                res.status(500).json({ error: 'Internal server error' });
            }
        });
    },
    getRosterSummary(_req, res) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const rosterRows = yield buildRosterRows();
                const rosterPlayerIds = rosterRows.map((row) => row.id);
                const averageAttendance = rosterRows.length > 0
                    ? Math.round((rosterRows.reduce((sum, row) => sum + (row.attendanceRate || 0), 0) / rosterRows.length) * 10) / 10
                    : 0;
                if (!rosterPlayerIds.length) {
                    return res.json({
                        athleteCount: 0,
                        averageAttendance,
                        currentPeriodAttendance: null,
                        previousPeriodAttendance: null,
                        attendanceDelta: null,
                        pendingPayments: 0,
                        pendingPlayerIds: [],
                    });
                }
                const attendanceSnap = yield firebaseAdmin_1.firestore.collection('attendance').get();
                const attendanceRows = attendanceSnap.docs
                    .map((docSnap) => docSnap.data())
                    .filter((row) => rosterPlayerIds.includes(row.playerId));
                const paymentSnap = yield firebaseAdmin_1.firestore.collection('playerPayments').get();
                const paymentRows = paymentSnap.docs
                    .map((docSnap) => docSnap.data())
                    .filter((row) => rosterPlayerIds.includes(row.playerId));
                const now = new Date();
                const currentStart = new Date(now);
                currentStart.setDate(currentStart.getDate() - 30);
                const previousStart = new Date(currentStart);
                previousStart.setDate(previousStart.getDate() - 30);
                const currentPeriodRecords = attendanceRows.filter((row) => {
                    const date = (0, firebaseAdmin_1.toDate)(row.date);
                    return date ? date >= currentStart && date <= now : false;
                });
                const previousPeriodRecords = attendanceRows.filter((row) => {
                    const date = (0, firebaseAdmin_1.toDate)(row.date);
                    return date ? date >= previousStart && date < currentStart : false;
                });
                const currentPeriodAttendance = computeAttendanceRateFromRecords(currentPeriodRecords);
                const previousPeriodAttendance = computeAttendanceRateFromRecords(previousPeriodRecords);
                const attendanceDelta = currentPeriodAttendance !== null && previousPeriodAttendance !== null
                    ? Math.round((currentPeriodAttendance - previousPeriodAttendance) * 10) / 10
                    : null;
                const latestPaymentByPlayer = new Map();
                for (const row of paymentRows) {
                    const current = latestPaymentByPlayer.get(row.playerId);
                    if (!current || isMoreRecentPayment(row, current)) {
                        latestPaymentByPlayer.set(row.playerId, row);
                    }
                }
                const pendingPlayerIds = rosterPlayerIds.filter((playerId) => {
                    const latest = latestPaymentByPlayer.get(playerId);
                    return !isPaidStatus(latest === null || latest === void 0 ? void 0 : latest.status);
                });
                res.json({
                    athleteCount: rosterRows.length,
                    averageAttendance,
                    currentPeriodAttendance,
                    previousPeriodAttendance,
                    attendanceDelta,
                    pendingPayments: pendingPlayerIds.length,
                    pendingPlayerIds,
                });
            }
            catch (error) {
                console.error('Get roster summary error:', error);
                res.status(500).json({ error: 'Internal server error' });
            }
        });
    },
    sendPaymentReminders(_req, res) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const rosterRows = yield buildRosterRows();
                const pendingPlayers = rosterRows.filter((player) => !isPaidStatus(player.paymentStatus));
                const reminderRecipients = pendingPlayers.map((player) => ({
                    id: player.id,
                    firstName: player.firstName,
                    lastName: player.lastName,
                    email: player.email,
                    paymentStatus: player.paymentStatus,
                }));
                res.json({
                    sent: reminderRecipients.length,
                    recipients: reminderRecipients,
                    sentAt: new Date().toISOString(),
                    provider: 'not-configured',
                });
            }
            catch (error) {
                console.error('Send payment reminders error:', error);
                res.status(500).json({ error: 'Internal server error' });
            }
        });
    },
    removeFromRoster(req, res) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const id = parseInt(req.params.id, 10);
                if (Number.isNaN(id)) {
                    return res.status(400).json({ error: 'Invalid player id' });
                }
                const batch = firebaseAdmin_1.firestore.batch();
                const joinsSnap = yield firebaseAdmin_1.firestore.collection('playersToTeams').where('playerId', '==', id).get();
                joinsSnap.docs.forEach((docSnap) => batch.delete(docSnap.ref));
                const playerSnap = yield firebaseAdmin_1.firestore.collection('players').where('id', '==', id).limit(1).get();
                const playerDoc = playerSnap.docs[0];
                if (playerDoc) {
                    batch.set(playerDoc.ref, { teamId: null, status: 'inactive' }, { merge: true });
                }
                yield batch.commit();
                res.json({ success: true });
            }
            catch (error) {
                console.error('Remove from roster error:', error);
                res.status(500).json({ error: 'Internal server error' });
            }
        });
    },
    addPlayerToTeam(req, res) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const { playerId, teamId } = req.body;
                if (!playerId || !teamId) {
                    return res.status(400).json({ error: 'playerId and teamId are required' });
                }
                const id = yield (0, firebaseAdmin_1.nextNumericId)('playersToTeams');
                const record = {
                    id,
                    playerId: Number(playerId),
                    teamId: Number(teamId),
                };
                yield firebaseAdmin_1.firestore.collection('playersToTeams').doc(String(id)).set(record);
                yield firebaseAdmin_1.firestore.collection('players').where('id', '==', Number(playerId)).limit(1).get().then((snap) => {
                    const docSnap = snap.docs[0];
                    if (docSnap) {
                        return docSnap.ref.set({ teamId: Number(teamId), status: 'active' }, { merge: true });
                    }
                    return null;
                });
                res.json(record);
            }
            catch (error) {
                console.error('Add player to team error:', error);
                res.status(500).json({ error: 'Internal server error' });
            }
        });
    },
    updatePlayer(req, res) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const { id } = req.params;
                const playerId = parseInt(id, 10);
                if (Number.isNaN(playerId)) {
                    return res.status(400).json({ error: 'Invalid player id' });
                }
                const snap = yield firebaseAdmin_1.firestore.collection('players').where('id', '==', playerId).limit(1).get();
                const docSnap = snap.docs[0];
                if (!docSnap) {
                    return res.status(404).json({ error: 'Player not found' });
                }
                const updateData = Object.assign({}, req.body);
                if (updateData.medicalCheckExpiry) {
                    updateData.medicalCheckExpiry = new Date(String(updateData.medicalCheckExpiry)).toISOString();
                }
                yield docSnap.ref.set(Object.assign(Object.assign({}, updateData), { updatedAt: firebaseAdmin_1.admin.firestore.FieldValue.serverTimestamp() }), { merge: true });
                const updated = yield docSnap.ref.get();
                const _a = updated.data(), { id: _ignored } = _a, updatedData = __rest(_a, ["id"]);
                res.json(Object.assign(Object.assign({}, updatedData), { id: playerId }));
            }
            catch (error) {
                console.error('Update player error:', error);
                res.status(500).json({ error: 'Internal server error' });
            }
        });
    },
    getPlayerById(req, res) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a;
            try {
                const { id } = req.params;
                const playerId = parseInt(id, 10);
                if (Number.isNaN(playerId)) {
                    return res.status(400).json({ error: 'Invalid player id' });
                }
                const result = yield firebaseAdmin_1.firestore.collection('players').where('id', '==', playerId).limit(1).get();
                const player = (_a = result.docs[0]) === null || _a === void 0 ? void 0 : _a.data();
                if (!player) {
                    return res.status(404).json({ error: 'Player not found' });
                }
                res.json({
                    id: player.id,
                    firstName: player.firstName,
                    lastName: player.lastName,
                    email: player.email,
                    number: player.number,
                    birthYear: player.birthYear,
                    status: player.status,
                    avatarUrl: player.avatarUrl,
                    medicalCheckExpiry: (0, firebaseAdmin_1.toIso)(player.medicalCheckExpiry),
                });
            }
            catch (error) {
                console.error('Get player by id error:', error);
                res.status(500).json({ error: 'Internal server error' });
            }
        });
    }
};
