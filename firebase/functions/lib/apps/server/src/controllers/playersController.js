"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.playersController = void 0;
const db_1 = require("../db");
const schema_1 = require("../db/schema");
const drizzle_orm_1 = require("drizzle-orm");
const DEFAULT_PAYMENT_CURRENCY = (process.env.STRIPE_CURRENCY || 'ron').trim().toLowerCase();
function isSuperadmin(req) {
    return req.user?.role === 'superadmin';
}
function getRequestClubId(req) {
    return req.user?.clubId == null ? null : Number(req.user.clubId);
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
async function getAllowedTeamIds(req) {
    if (isSuperadmin(req))
        return null;
    const clubId = getRequestClubId(req);
    if (clubId == null)
        return [];
    const clubTeams = await db_1.db.select({ id: schema_1.teams.id }).from(schema_1.teams).where((0, drizzle_orm_1.eq)(schema_1.teams.clubId, clubId));
    return clubTeams.map(t => t.id);
}
async function getPlayerClubIdByEmail(email) {
    if (!email)
        return null;
    const userRows = await db_1.db
        .select({ clubId: schema_1.users.clubId })
        .from(schema_1.users)
        .where((0, drizzle_orm_1.eq)(schema_1.users.email, email.trim().toLowerCase()))
        .limit(1);
    return userRows[0]?.clubId == null ? null : Number(userRows[0].clubId);
}
async function isPlayerAllowedForRequest(req, player) {
    const allowedTeamIds = await getAllowedTeamIds(req);
    if (allowedTeamIds === null)
        return true;
    const allowedSet = new Set(allowedTeamIds);
    const membershipRows = await db_1.db.select().from(schema_1.playersToTeams).where((0, drizzle_orm_1.eq)(schema_1.playersToTeams.playerId, player.id));
    const isAssignedToAllowedTeam = Boolean(player.teamId && allowedSet.has(player.teamId)) || membershipRows.some(m => allowedSet.has(m.teamId));
    if (isAssignedToAllowedTeam)
        return true;
    const requestClubId = getRequestClubId(req);
    const playerClubId = await getPlayerClubIdByEmail(player.email);
    return requestClubId != null && playerClubId === requestClubId;
}
function monthName(month, year) {
    if (!month || !year)
        return 'Season Fee';
    return `${new Intl.DateTimeFormat('en', { month: 'long' }).format(new Date(year, month - 1, 1))} ${year} Fee`;
}
function getPaymentDate(value) {
    return value ? new Date(value).toISOString() : new Date().toISOString();
}
async function buildPlayerPaymentSummary(playerId) {
    const paymentRows = await db_1.db.select().from(schema_1.playerPayments).where((0, drizzle_orm_1.eq)(schema_1.playerPayments.playerId, playerId));
    const paidRows = paymentRows.filter(row => isPaidStatus(row.status));
    const unpaidRows = paymentRows.filter(row => !isPaidStatus(row.status));
    const paidAmount = paidRows.reduce((sum, row) => sum + Number(row.amount ?? 0), 0);
    const outstandingAmount = unpaidRows.reduce((sum, row) => sum + Number(row.amount ?? 0), 0);
    const latestPayment = [...paymentRows].sort((a, b) => new Date(b.date ?? b.createdAt ?? 0).getTime() - new Date(a.date ?? a.createdAt ?? 0).getTime())[0];
    return {
        paymentStatus: latestPayment?.status ?? 'pending',
        paidAmount,
        outstandingAmount,
        amountDue: outstandingAmount,
        paymentCurrency: DEFAULT_PAYMENT_CURRENCY,
        paymentTransactions: paymentRows
            .filter(row => isPaidStatus(row.status) || normalizePaymentStatus(row.status) === 'failed' || normalizePaymentStatus(row.status) === 'error')
            .sort((a, b) => new Date(b.date ?? b.createdAt ?? 0).getTime() - new Date(a.date ?? a.createdAt ?? 0).getTime())
            .map(row => ({
            id: String(row.id),
            label: monthName(row.month, row.year),
            amount: Number(row.amount ?? 0),
            currency: DEFAULT_PAYMENT_CURRENCY,
            status: isPaidStatus(row.status) ? 'success' : 'error',
            date: getPaymentDate(row.date ?? row.createdAt),
        })),
    };
}
async function buildRosterRows(req) {
    const allowedTeamIds = await getAllowedTeamIds(req);
    if (allowedTeamIds !== null && allowedTeamIds.length === 0)
        return [];
    let allPlayers = await db_1.db.select().from(schema_1.players);
    let membershipRows = await db_1.db.select().from(schema_1.playersToTeams);
    let allTeams = await db_1.db.select().from(schema_1.teams);
    const userRows = await db_1.db.select({
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
    const attendanceRows = await db_1.db.select().from(schema_1.attendance).where((0, drizzle_orm_1.inArray)(schema_1.attendance.playerId, playerIds));
    const paymentRows = await db_1.db.select().from(schema_1.playerPayments).where((0, drizzle_orm_1.inArray)(schema_1.playerPayments.playerId, playerIds));
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
            if (row.year > current.year || (row.year === current.year && row.month > current.month) || (row.year === current.year && row.month === current.month && new Date(row.createdAt ?? 0).getTime() > new Date(current.createdAt ?? 0).getTime())) {
                latestPaymentByPlayer.set(row.playerId, row);
            }
        }
    }
    return allPlayers.map(player => {
        const firstName = player.firstName || player.name?.split(' ')[0] || 'Unknown';
        const lastName = player.lastName || player.name?.split(' ').slice(1).join(' ') || 'Player';
        const playerTeams = teamsByPlayer.get(player.id) || [];
        const sortedTeams = [...playerTeams].sort((a, b) => b.name.localeCompare(a.name));
        const category = sortedTeams[0]?.name || 'Unassigned';
        const teamNames = playerTeams.map((team) => team.name);
        const clubId = player.email ? clubIdByUserEmail.get(player.email.trim().toLowerCase()) ?? null : null;
        const attendanceStats = attendanceByPlayer.get(player.id);
        const attendanceRate = attendanceStats && attendanceStats.total > 0
            ? Math.round((attendanceStats.present / attendanceStats.total) * 100)
            : 0;
        const latestPayment = latestPaymentByPlayer.get(player.id);
        const paymentStatus = latestPayment?.status || 'pending';
        return {
            ...player,
            firstName,
            lastName,
            category,
            attendanceRate,
            paymentStatus,
            teamName: teamNames[0] || 'Unassigned',
            teamNames,
            clubId,
            isUnassigned: teamNames.length === 0,
        };
    });
}
function computeAttendanceRateFromRecords(records) {
    if (records.length === 0)
        return null;
    const present = records.filter(record => isAttendancePresent(record.status)).length;
    return Math.round((present / records.length) * 1000) / 10;
}
exports.playersController = {
    async searchPlayers(req, res) {
        try {
            const { query } = req.query;
            if (!query || typeof query !== 'string') {
                return res.status(400).json({ error: 'Search query is required' });
            }
            const allowedTeamIds = await getAllowedTeamIds(req);
            if (allowedTeamIds !== null && allowedTeamIds.length === 0)
                return res.json([]);
            const q = query.toLowerCase();
            let allPlayers = await db_1.db.select().from(schema_1.players);
            const userRows = await db_1.db.select({
                email: schema_1.users.email,
                clubId: schema_1.users.clubId,
            }).from(schema_1.users);
            const clubIdByUserEmail = new Map(userRows
                .filter(user => user.clubId != null)
                .map(user => [user.email.trim().toLowerCase(), Number(user.clubId)]));
            if (allowedTeamIds !== null) {
                const membershipRows = await db_1.db.select().from(schema_1.playersToTeams).where((0, drizzle_orm_1.inArray)(schema_1.playersToTeams.teamId, allowedTeamIds));
                const allowedPlayerIds = new Set(membershipRows.map(m => m.playerId));
                const allowedTeamsSet = new Set(allowedTeamIds);
                const clubId = getRequestClubId(req);
                allPlayers = allPlayers.filter(p => {
                    const playerClubId = p.email ? clubIdByUserEmail.get(p.email.trim().toLowerCase()) : null;
                    return (p.teamId != null && allowedTeamsSet.has(p.teamId)) || allowedPlayerIds.has(p.id) || (clubId != null && playerClubId === clubId);
                });
            }
            const results = allPlayers.filter(player => {
                const haystack = `${player.firstName ?? ''} ${player.lastName ?? ''} ${player.name ?? ''}`.toLowerCase();
                return haystack.includes(q);
            });
            res.json(results);
        }
        catch (error) {
            console.error('Search players error:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    },
    async getRoster(req, res) {
        try {
            const rosterWithData = await buildRosterRows(req);
            res.json(rosterWithData);
        }
        catch (error) {
            console.error('Get roster error:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    },
    async getRosterSummary(req, res) {
        try {
            const rosterRows = await buildRosterRows(req);
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
            const attendanceRows = await db_1.db.select().from(schema_1.attendance).where((0, drizzle_orm_1.inArray)(schema_1.attendance.playerId, rosterPlayerIds));
            const paymentRows = await db_1.db.select().from(schema_1.playerPayments).where((0, drizzle_orm_1.inArray)(schema_1.playerPayments.playerId, rosterPlayerIds));
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
                    if (row.year > current.year || (row.year === current.year && row.month > current.month) || (row.year === current.year && row.month === current.month && new Date(row.createdAt ?? 0).getTime() > new Date(current.createdAt ?? 0).getTime())) {
                        latestPaymentByPlayer.set(row.playerId, row);
                    }
                }
            }
            const pendingPlayerIds = rosterPlayerIds.filter(playerId => {
                const latest = latestPaymentByPlayer.get(playerId);
                return !isPaidStatus(latest?.status);
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
    },
    async sendPaymentReminders(req, res) {
        try {
            const role = req.user?.role;
            if (role !== 'admin' && role !== 'superadmin' && role !== 'accountant' && role !== 'manager') {
                return res.status(403).json({ error: 'Forbidden' });
            }
            const rosterRows = await buildRosterRows(req);
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
    },
    async removeFromRoster(req, res) {
        try {
            const role = req.user?.role;
            if (role !== 'admin' && role !== 'superadmin' && role !== 'coach' && role !== 'manager') {
                return res.status(403).json({ error: 'Forbidden' });
            }
            const id = parseInt(req.params.id, 10);
            if (Number.isNaN(id))
                return res.status(400).json({ error: 'Invalid player id' });
            const allowedTeamIds = await getAllowedTeamIds(req);
            if (allowedTeamIds !== null) {
                const pRows = await db_1.db.select().from(schema_1.players).where((0, drizzle_orm_1.eq)(schema_1.players.id, id)).limit(1);
                const p = pRows[0];
                if (!p)
                    return res.status(404).json({ error: 'Not found' });
                const mRows = await db_1.db.select().from(schema_1.playersToTeams).where((0, drizzle_orm_1.eq)(schema_1.playersToTeams.playerId, id));
                const allowedSet = new Set(allowedTeamIds);
                const isAllowed = (p.teamId && allowedSet.has(p.teamId)) || mRows.some(m => allowedSet.has(m.teamId));
                if (!isAllowed)
                    return res.status(403).json({ error: 'Access denied' });
            }
            await db_1.db.delete(schema_1.playersToTeams).where((0, drizzle_orm_1.eq)(schema_1.playersToTeams.playerId, id));
            await db_1.db.update(schema_1.players).set({ teamId: null, status: 'inactive' }).where((0, drizzle_orm_1.eq)(schema_1.players.id, id));
            res.json({ success: true });
        }
        catch (error) {
            console.error('Remove from roster error:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    },
    async addPlayerToTeam(req, res) {
        try {
            const role = req.user?.role;
            if (role !== 'admin' && role !== 'superadmin' && role !== 'coach' && role !== 'manager') {
                return res.status(403).json({ error: 'Forbidden' });
            }
            const { playerId, teamId } = req.body;
            if (!playerId || !teamId)
                return res.status(400).json({ error: 'playerId and teamId required' });
            const allowedTeamIds = await getAllowedTeamIds(req);
            if (allowedTeamIds !== null && !allowedTeamIds.includes(Number(teamId))) {
                return res.status(403).json({ error: 'Cannot add to a team outside your club' });
            }
            const [inserted] = await db_1.db.insert(schema_1.playersToTeams).values({
                playerId: Number(playerId),
                teamId: Number(teamId)
            }).returning();
            await db_1.db.update(schema_1.players).set({ teamId: Number(teamId), status: 'active' }).where((0, drizzle_orm_1.eq)(schema_1.players.id, Number(playerId)));
            res.json(inserted);
        }
        catch (error) {
            console.error('Add player to team error:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    },
    async updatePlayer(req, res) {
        try {
            const role = req.user?.role;
            if (role !== 'admin' && role !== 'superadmin' && role !== 'coach' && role !== 'manager') {
                return res.status(403).json({ error: 'Forbidden' });
            }
            const playerId = parseInt(req.params.id, 10);
            if (Number.isNaN(playerId))
                return res.status(400).json({ error: 'Invalid id' });
            const pRows = await db_1.db.select().from(schema_1.players).where((0, drizzle_orm_1.eq)(schema_1.players.id, playerId)).limit(1);
            if (!pRows[0])
                return res.status(404).json({ error: 'Player not found' });
            const allowedTeamIds = await getAllowedTeamIds(req);
            if (allowedTeamIds !== null) {
                const p = pRows[0];
                if (!await isPlayerAllowedForRequest(req, p))
                    return res.status(403).json({ error: 'Access denied' });
            }
            const updateData = { ...req.body };
            if (req.body.medicalCheckExpiry) {
                updateData.medicalCheckExpiry = new Date(String(req.body.medicalCheckExpiry)).toISOString();
            }
            delete updateData.id;
            const [updated] = await db_1.db.update(schema_1.players).set(updateData).where((0, drizzle_orm_1.eq)(schema_1.players.id, playerId)).returning();
            res.json(updated);
        }
        catch (error) {
            console.error('Update player error:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    },
    async getPlayerById(req, res) {
        try {
            const playerId = parseInt(req.params.id, 10);
            if (Number.isNaN(playerId))
                return res.status(400).json({ error: 'Invalid id' });
            const pRows = await db_1.db.select().from(schema_1.players).where((0, drizzle_orm_1.eq)(schema_1.players.id, playerId)).limit(1);
            const player = pRows[0];
            if (!player)
                return res.status(404).json({ error: 'Player not found' });
            const allowedTeamIds = await getAllowedTeamIds(req);
            if (allowedTeamIds !== null) {
                if (!await isPlayerAllowedForRequest(req, player))
                    return res.status(403).json({ error: 'Access denied' });
            }
            const rosterRows = await buildRosterRows(req);
            const rosterPlayer = rosterRows.find(row => row.id === player.id);
            const paymentSummary = await buildPlayerPaymentSummary(player.id);
            res.json({
                ...player,
                ...rosterPlayer,
                ...paymentSummary,
                clubId: rosterPlayer?.clubId ?? await getPlayerClubIdByEmail(player.email),
                isUnassigned: rosterPlayer?.isUnassigned ?? true,
                teamName: rosterPlayer?.teamName ?? 'Unassigned',
                teamNames: rosterPlayer?.teamNames ?? [],
                category: rosterPlayer?.category ?? 'Unassigned',
            });
        }
        catch (error) {
            console.error('Get player by id error:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    }
};
