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
exports.playersController = void 0;
const db_1 = require("../db");
const schema_1 = require("../db/schema");
const drizzle_orm_1 = require("drizzle-orm");
const DEFAULT_PAYMENT_CURRENCY = (process.env.STRIPE_CURRENCY || 'ron').trim().toLowerCase();
function isSuperadmin(req) {
    var _a;
    return ((_a = req.user) === null || _a === void 0 ? void 0 : _a.role) === 'superadmin';
}
function getRequestClubId(req) {
    var _a;
    return ((_a = req.user) === null || _a === void 0 ? void 0 : _a.clubId) == null ? null : Number(req.user.clubId);
}
function normalizePaymentStatus(status) {
    return (status || '').trim().toLowerCase();
}
function isPaidStatus(status) {
    const normalized = normalizePaymentStatus(status);
    return normalized === 'paid' || normalized === 'processed' || normalized === 'succeeded' || normalized === 'success';
}
function isAttendancePresent(status) {
    const normalized = (status || '').trim().toLowerCase();
    return normalized === 'present' || normalized === 'late' || normalized === 'medical' || normalized === 'excused';
}
function getAllowedTeamIds(req) {
    return __awaiter(this, void 0, void 0, function* () {
        if (isSuperadmin(req))
            return null;
        const clubId = getRequestClubId(req);
        if (clubId == null)
            return [];
        const clubTeams = yield db_1.db.select({ id: schema_1.teams.id }).from(schema_1.teams).where((0, drizzle_orm_1.eq)(schema_1.teams.clubId, clubId));
        return clubTeams.map(t => t.id);
    });
}
function getPlayerClubIdByEmail(email) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a;
        if (!email)
            return null;
        const userRows = yield db_1.db
            .select({ clubId: schema_1.users.clubId })
            .from(schema_1.users)
            .where((0, drizzle_orm_1.eq)(schema_1.users.email, email.trim().toLowerCase()))
            .limit(1);
        return ((_a = userRows[0]) === null || _a === void 0 ? void 0 : _a.clubId) == null ? null : Number(userRows[0].clubId);
    });
}
function isPlayerAllowedForRequest(req, player) {
    return __awaiter(this, void 0, void 0, function* () {
        const allowedTeamIds = yield getAllowedTeamIds(req);
        if (allowedTeamIds === null)
            return true;
        const allowedSet = new Set(allowedTeamIds);
        const membershipRows = yield db_1.db.select().from(schema_1.playersToTeams).where((0, drizzle_orm_1.eq)(schema_1.playersToTeams.playerId, player.id));
        const isAssignedToAllowedTeam = Boolean(player.teamId && allowedSet.has(player.teamId)) || membershipRows.some(m => allowedSet.has(m.teamId));
        if (isAssignedToAllowedTeam)
            return true;
        const requestClubId = getRequestClubId(req);
        const playerClubId = yield getPlayerClubIdByEmail(player.email);
        return requestClubId != null && playerClubId === requestClubId;
    });
}
function monthName(month, year) {
    if (!month || !year)
        return 'Season Fee';
    return `${new Intl.DateTimeFormat('en', { month: 'long' }).format(new Date(year, month - 1, 1))} ${year} Fee`;
}
function getPaymentDate(value) {
    return value ? new Date(value).toISOString() : new Date().toISOString();
}
function buildPlayerPaymentSummary(playerId) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a;
        const paymentRows = yield db_1.db.select().from(schema_1.playerPayments).where((0, drizzle_orm_1.eq)(schema_1.playerPayments.playerId, playerId));
        const paidRows = paymentRows.filter(row => isPaidStatus(row.status));
        const unpaidRows = paymentRows.filter(row => !isPaidStatus(row.status));
        const paidAmount = paidRows.reduce((sum, row) => { var _a; return sum + Number((_a = row.amount) !== null && _a !== void 0 ? _a : 0); }, 0);
        const outstandingAmount = unpaidRows.reduce((sum, row) => { var _a; return sum + Number((_a = row.amount) !== null && _a !== void 0 ? _a : 0); }, 0);
        const latestPayment = [...paymentRows].sort((a, b) => { var _a, _b, _c, _d; return new Date((_b = (_a = b.date) !== null && _a !== void 0 ? _a : b.createdAt) !== null && _b !== void 0 ? _b : 0).getTime() - new Date((_d = (_c = a.date) !== null && _c !== void 0 ? _c : a.createdAt) !== null && _d !== void 0 ? _d : 0).getTime(); })[0];
        return {
            paymentStatus: (_a = latestPayment === null || latestPayment === void 0 ? void 0 : latestPayment.status) !== null && _a !== void 0 ? _a : 'pending',
            paidAmount,
            outstandingAmount,
            amountDue: outstandingAmount,
            paymentCurrency: DEFAULT_PAYMENT_CURRENCY,
            paymentTransactions: paymentRows
                .filter(row => isPaidStatus(row.status) || normalizePaymentStatus(row.status) === 'failed' || normalizePaymentStatus(row.status) === 'error')
                .sort((a, b) => { var _a, _b, _c, _d; return new Date((_b = (_a = b.date) !== null && _a !== void 0 ? _a : b.createdAt) !== null && _b !== void 0 ? _b : 0).getTime() - new Date((_d = (_c = a.date) !== null && _c !== void 0 ? _c : a.createdAt) !== null && _d !== void 0 ? _d : 0).getTime(); })
                .map(row => {
                var _a, _b;
                return ({
                    id: String(row.id),
                    label: monthName(row.month, row.year),
                    amount: Number((_a = row.amount) !== null && _a !== void 0 ? _a : 0),
                    currency: DEFAULT_PAYMENT_CURRENCY,
                    status: isPaidStatus(row.status) ? 'success' : 'error',
                    date: getPaymentDate((_b = row.date) !== null && _b !== void 0 ? _b : row.createdAt),
                });
            }),
        };
    });
}
function buildRosterRows(req) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b;
        const allowedTeamIds = yield getAllowedTeamIds(req);
        if (allowedTeamIds !== null && allowedTeamIds.length === 0)
            return [];
        let allPlayers = yield db_1.db.select().from(schema_1.players);
        let membershipRows = yield db_1.db.select().from(schema_1.playersToTeams);
        let allTeams = yield db_1.db.select().from(schema_1.teams);
        const userRows = yield db_1.db.select({
            email: schema_1.users.email,
            clubId: schema_1.users.clubId,
        }).from(schema_1.users);
        const clubIdByUserEmail = new Map(userRows
            .filter(user => user.clubId != null)
            .map(user => [user.email.trim().toLowerCase(), Number(user.clubId)]));
        if (allowedTeamIds !== null) {
            const allowedTeamsSet = new Set(allowedTeamIds);
            const allowedPlayerIds = new Set();
            const clubId = getRequestClubId(req);
            allPlayers.forEach(p => {
                if (p.teamId != null && allowedTeamsSet.has(p.teamId)) {
                    allowedPlayerIds.add(p.id);
                }
                const playerClubId = p.email ? clubIdByUserEmail.get(p.email.trim().toLowerCase()) : null;
                if (clubId != null && playerClubId === clubId) {
                    allowedPlayerIds.add(p.id);
                }
            });
            membershipRows.forEach(m => {
                if (allowedTeamsSet.has(m.teamId)) {
                    allowedPlayerIds.add(m.playerId);
                }
            });
            allPlayers = allPlayers.filter(p => allowedPlayerIds.has(p.id));
            membershipRows = membershipRows.filter(m => allowedPlayerIds.has(m.playerId));
            allTeams = allTeams.filter(t => allowedTeamsSet.has(t.id));
        }
        if (!allPlayers.length)
            return [];
        const playerIds = allPlayers.map(p => p.id);
        // Split into chunks if necessary, but Drizzle handles normal arrays
        const attendanceRows = yield db_1.db.select().from(schema_1.attendance).where((0, drizzle_orm_1.inArray)(schema_1.attendance.playerId, playerIds));
        const paymentRows = yield db_1.db.select().from(schema_1.playerPayments).where((0, drizzle_orm_1.inArray)(schema_1.playerPayments.playerId, playerIds));
        const teamsById = new Map(allTeams.map(t => [t.id, t]));
        const teamsByPlayer = new Map();
        for (const row of membershipRows) {
            const team = teamsById.get(row.teamId);
            if (!team)
                continue;
            const list = teamsByPlayer.get(row.playerId) || [];
            list.push({ name: team.name, leagueName: team.leagueName || '' });
            teamsByPlayer.set(row.playerId, list);
        }
        for (const p of allPlayers) {
            if (p.teamId) {
                const team = teamsById.get(p.teamId);
                if (team) {
                    const list = teamsByPlayer.get(p.id) || [];
                    if (!list.some(t => t.name === team.name)) {
                        list.push({ name: team.name, leagueName: team.leagueName || '' });
                        teamsByPlayer.set(p.id, list);
                    }
                }
            }
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
            if (!current) {
                latestPaymentByPlayer.set(row.playerId, row);
            }
            else {
                if (row.year > current.year || (row.year === current.year && row.month > current.month) || (row.year === current.year && row.month === current.month && new Date((_a = row.createdAt) !== null && _a !== void 0 ? _a : 0).getTime() > new Date((_b = current.createdAt) !== null && _b !== void 0 ? _b : 0).getTime())) {
                    latestPaymentByPlayer.set(row.playerId, row);
                }
            }
        }
        return allPlayers.map(player => {
            var _a, _b, _c, _d;
            const firstName = player.firstName || ((_a = player.name) === null || _a === void 0 ? void 0 : _a.split(' ')[0]) || 'Unknown';
            const lastName = player.lastName || ((_b = player.name) === null || _b === void 0 ? void 0 : _b.split(' ').slice(1).join(' ')) || 'Player';
            const playerTeams = teamsByPlayer.get(player.id) || [];
            const sortedTeams = [...playerTeams].sort((a, b) => b.name.localeCompare(a.name));
            const category = ((_c = sortedTeams[0]) === null || _c === void 0 ? void 0 : _c.name) || 'Unassigned';
            const teamNames = playerTeams.map((team) => team.name);
            const clubId = player.email ? (_d = clubIdByUserEmail.get(player.email.trim().toLowerCase())) !== null && _d !== void 0 ? _d : null : null;
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
                paymentStatus, teamName: teamNames[0] || 'Unassigned', teamNames,
                clubId, isUnassigned: teamNames.length === 0 });
        });
    });
}
function computeAttendanceRateFromRecords(records) {
    if (records.length === 0)
        return null;
    const present = records.filter(record => isAttendancePresent(record.status)).length;
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
                const allowedTeamIds = yield getAllowedTeamIds(req);
                if (allowedTeamIds !== null && allowedTeamIds.length === 0)
                    return res.json([]);
                const q = query.toLowerCase();
                let allPlayers = yield db_1.db.select().from(schema_1.players);
                const userRows = yield db_1.db.select({
                    email: schema_1.users.email,
                    clubId: schema_1.users.clubId,
                }).from(schema_1.users);
                const clubIdByUserEmail = new Map(userRows
                    .filter(user => user.clubId != null)
                    .map(user => [user.email.trim().toLowerCase(), Number(user.clubId)]));
                if (allowedTeamIds !== null) {
                    const membershipRows = yield db_1.db.select().from(schema_1.playersToTeams).where((0, drizzle_orm_1.inArray)(schema_1.playersToTeams.teamId, allowedTeamIds));
                    const allowedPlayerIds = new Set(membershipRows.map(m => m.playerId));
                    const allowedTeamsSet = new Set(allowedTeamIds);
                    const clubId = getRequestClubId(req);
                    allPlayers = allPlayers.filter(p => {
                        const playerClubId = p.email ? clubIdByUserEmail.get(p.email.trim().toLowerCase()) : null;
                        return (p.teamId != null && allowedTeamsSet.has(p.teamId)) || allowedPlayerIds.has(p.id) || (clubId != null && playerClubId === clubId);
                    });
                }
                const results = allPlayers.filter(player => {
                    var _a, _b, _c;
                    const haystack = `${(_a = player.firstName) !== null && _a !== void 0 ? _a : ''} ${(_b = player.lastName) !== null && _b !== void 0 ? _b : ''} ${(_c = player.name) !== null && _c !== void 0 ? _c : ''}`.toLowerCase();
                    return haystack.includes(q);
                });
                res.json(results);
            }
            catch (error) {
                console.error('Search players error:', error);
                res.status(500).json({ error: 'Internal server error' });
            }
        });
    },
    getRoster(req, res) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const rosterWithData = yield buildRosterRows(req);
                res.json(rosterWithData);
            }
            catch (error) {
                console.error('Get roster error:', error);
                res.status(500).json({ error: 'Internal server error' });
            }
        });
    },
    getRosterSummary(req, res) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, _b;
            try {
                const rosterRows = yield buildRosterRows(req);
                const rosterPlayerIds = rosterRows.map(row => row.id);
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
                const attendanceRows = yield db_1.db.select().from(schema_1.attendance).where((0, drizzle_orm_1.inArray)(schema_1.attendance.playerId, rosterPlayerIds));
                const paymentRows = yield db_1.db.select().from(schema_1.playerPayments).where((0, drizzle_orm_1.inArray)(schema_1.playerPayments.playerId, rosterPlayerIds));
                const now = new Date();
                const currentStart = new Date(now);
                currentStart.setDate(currentStart.getDate() - 30);
                const previousStart = new Date(currentStart);
                previousStart.setDate(previousStart.getDate() - 30);
                const currentPeriodRecords = attendanceRows.filter(row => {
                    const date = row.date ? new Date(row.date) : null;
                    return date ? date >= currentStart && date <= now : false;
                });
                const previousPeriodRecords = attendanceRows.filter(row => {
                    const date = row.date ? new Date(row.date) : null;
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
                    if (!current) {
                        latestPaymentByPlayer.set(row.playerId, row);
                    }
                    else {
                        if (row.year > current.year || (row.year === current.year && row.month > current.month) || (row.year === current.year && row.month === current.month && new Date((_a = row.createdAt) !== null && _a !== void 0 ? _a : 0).getTime() > new Date((_b = current.createdAt) !== null && _b !== void 0 ? _b : 0).getTime())) {
                            latestPaymentByPlayer.set(row.playerId, row);
                        }
                    }
                }
                const pendingPlayerIds = rosterPlayerIds.filter(playerId => {
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
    sendPaymentReminders(req, res) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a;
            try {
                const role = (_a = req.user) === null || _a === void 0 ? void 0 : _a.role;
                if (role !== 'admin' && role !== 'superadmin' && role !== 'accountant' && role !== 'manager') {
                    return res.status(403).json({ error: 'Forbidden' });
                }
                const rosterRows = yield buildRosterRows(req);
                const pendingPlayers = rosterRows.filter(player => !isPaidStatus(player.paymentStatus));
                const reminderRecipients = pendingPlayers.map(player => ({
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
            var _a;
            try {
                const role = (_a = req.user) === null || _a === void 0 ? void 0 : _a.role;
                if (role !== 'admin' && role !== 'superadmin' && role !== 'coach' && role !== 'manager') {
                    return res.status(403).json({ error: 'Forbidden' });
                }
                const id = parseInt(req.params.id, 10);
                if (Number.isNaN(id))
                    return res.status(400).json({ error: 'Invalid player id' });
                const allowedTeamIds = yield getAllowedTeamIds(req);
                if (allowedTeamIds !== null) {
                    const pRows = yield db_1.db.select().from(schema_1.players).where((0, drizzle_orm_1.eq)(schema_1.players.id, id)).limit(1);
                    const p = pRows[0];
                    if (!p)
                        return res.status(404).json({ error: 'Not found' });
                    const mRows = yield db_1.db.select().from(schema_1.playersToTeams).where((0, drizzle_orm_1.eq)(schema_1.playersToTeams.playerId, id));
                    const allowedSet = new Set(allowedTeamIds);
                    const isAllowed = (p.teamId && allowedSet.has(p.teamId)) || mRows.some(m => allowedSet.has(m.teamId));
                    if (!isAllowed)
                        return res.status(403).json({ error: 'Access denied' });
                }
                yield db_1.db.delete(schema_1.playersToTeams).where((0, drizzle_orm_1.eq)(schema_1.playersToTeams.playerId, id));
                yield db_1.db.update(schema_1.players).set({ teamId: null, status: 'inactive' }).where((0, drizzle_orm_1.eq)(schema_1.players.id, id));
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
            var _a;
            try {
                const role = (_a = req.user) === null || _a === void 0 ? void 0 : _a.role;
                if (role !== 'admin' && role !== 'superadmin' && role !== 'coach' && role !== 'manager') {
                    return res.status(403).json({ error: 'Forbidden' });
                }
                const { playerId, teamId } = req.body;
                if (!playerId || !teamId)
                    return res.status(400).json({ error: 'playerId and teamId required' });
                const allowedTeamIds = yield getAllowedTeamIds(req);
                if (allowedTeamIds !== null && !allowedTeamIds.includes(Number(teamId))) {
                    return res.status(403).json({ error: 'Cannot add to a team outside your club' });
                }
                const [inserted] = yield db_1.db.insert(schema_1.playersToTeams).values({
                    playerId: Number(playerId),
                    teamId: Number(teamId)
                }).returning();
                yield db_1.db.update(schema_1.players).set({ teamId: Number(teamId), status: 'active' }).where((0, drizzle_orm_1.eq)(schema_1.players.id, Number(playerId)));
                res.json(inserted);
            }
            catch (error) {
                console.error('Add player to team error:', error);
                res.status(500).json({ error: 'Internal server error' });
            }
        });
    },
    updatePlayer(req, res) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a;
            try {
                const role = (_a = req.user) === null || _a === void 0 ? void 0 : _a.role;
                if (role !== 'admin' && role !== 'superadmin' && role !== 'coach' && role !== 'manager') {
                    return res.status(403).json({ error: 'Forbidden' });
                }
                const playerId = parseInt(req.params.id, 10);
                if (Number.isNaN(playerId))
                    return res.status(400).json({ error: 'Invalid id' });
                const pRows = yield db_1.db.select().from(schema_1.players).where((0, drizzle_orm_1.eq)(schema_1.players.id, playerId)).limit(1);
                if (!pRows[0])
                    return res.status(404).json({ error: 'Player not found' });
                const allowedTeamIds = yield getAllowedTeamIds(req);
                if (allowedTeamIds !== null) {
                    const p = pRows[0];
                    if (!(yield isPlayerAllowedForRequest(req, p)))
                        return res.status(403).json({ error: 'Access denied' });
                }
                const updateData = Object.assign({}, req.body);
                if (req.body.medicalCheckExpiry) {
                    updateData.medicalCheckExpiry = new Date(String(req.body.medicalCheckExpiry)).toISOString();
                }
                delete updateData.id;
                const [updated] = yield db_1.db.update(schema_1.players).set(updateData).where((0, drizzle_orm_1.eq)(schema_1.players.id, playerId)).returning();
                res.json(updated);
            }
            catch (error) {
                console.error('Update player error:', error);
                res.status(500).json({ error: 'Internal server error' });
            }
        });
    },
    getPlayerById(req, res) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, _b, _c, _d, _e;
            try {
                const playerId = parseInt(req.params.id, 10);
                if (Number.isNaN(playerId))
                    return res.status(400).json({ error: 'Invalid id' });
                const pRows = yield db_1.db.select().from(schema_1.players).where((0, drizzle_orm_1.eq)(schema_1.players.id, playerId)).limit(1);
                const player = pRows[0];
                if (!player)
                    return res.status(404).json({ error: 'Player not found' });
                const allowedTeamIds = yield getAllowedTeamIds(req);
                if (allowedTeamIds !== null) {
                    if (!(yield isPlayerAllowedForRequest(req, player)))
                        return res.status(403).json({ error: 'Access denied' });
                }
                const rosterRows = yield buildRosterRows(req);
                const rosterPlayer = rosterRows.find(row => row.id === player.id);
                const paymentSummary = yield buildPlayerPaymentSummary(player.id);
                res.json(Object.assign(Object.assign(Object.assign(Object.assign({}, player), rosterPlayer), paymentSummary), { clubId: (_a = rosterPlayer === null || rosterPlayer === void 0 ? void 0 : rosterPlayer.clubId) !== null && _a !== void 0 ? _a : yield getPlayerClubIdByEmail(player.email), isUnassigned: (_b = rosterPlayer === null || rosterPlayer === void 0 ? void 0 : rosterPlayer.isUnassigned) !== null && _b !== void 0 ? _b : true, teamName: (_c = rosterPlayer === null || rosterPlayer === void 0 ? void 0 : rosterPlayer.teamName) !== null && _c !== void 0 ? _c : 'Unassigned', teamNames: (_d = rosterPlayer === null || rosterPlayer === void 0 ? void 0 : rosterPlayer.teamNames) !== null && _d !== void 0 ? _d : [], category: (_e = rosterPlayer === null || rosterPlayer === void 0 ? void 0 : rosterPlayer.category) !== null && _e !== void 0 ? _e : 'Unassigned' }));
            }
            catch (error) {
                console.error('Get player by id error:', error);
                res.status(500).json({ error: 'Internal server error' });
            }
        });
    }
};
