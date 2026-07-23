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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const drizzle_orm_1 = require("drizzle-orm");
const crypto_1 = __importDefault(require("crypto"));
const db_1 = require("../db");
const schema_1 = require("../db/schema");
const auth_1 = require("../middleware/auth");
const router = (0, express_1.Router)();
router.use(auth_1.authenticate);
const TEAM_GENDERS = ['M', 'F'];
const TEAM_LEVELS = ['national', 'municipal', 'initiere'];
function isAttendancePresent(status) {
    const normalized = (status || '').trim().toLowerCase();
    return normalized === 'present' || normalized === 'late' || normalized === 'medical' || normalized === 'excused';
}
function isPaidStatus(status) {
    const normalized = (status || '').trim().toLowerCase();
    return normalized === 'paid' || normalized === 'processed' || normalized === 'succeeded' || normalized === 'success';
}
function mapTeam(team) {
    var _a, _b, _c;
    return Object.assign(Object.assign({}, team), { createdAt: (_a = team.createdAt) !== null && _a !== void 0 ? _a : new Date().toISOString(), updatedAt: (_c = (_b = team.updatedAt) !== null && _b !== void 0 ? _b : team.createdAt) !== null && _c !== void 0 ? _c : new Date().toISOString() });
}
function getRequestClubId(req) {
    var _a;
    return ((_a = req.user) === null || _a === void 0 ? void 0 : _a.clubId) == null ? null : Number(req.user.clubId);
}
function isSuperadmin(req) {
    var _a;
    return ((_a = req.user) === null || _a === void 0 ? void 0 : _a.role) === 'superadmin';
}
function resolveScopedClubId(req, explicitClubId) {
    return __awaiter(this, void 0, void 0, function* () {
        if (!req.user) {
            throw new Error('Authentication is required.');
        }
        const requestClubId = getRequestClubId(req);
        if (requestClubId != null) {
            return requestClubId;
        }
        if (!isSuperadmin(req)) {
            throw new Error('Your account is not assigned to a club.');
        }
        const parsedClubId = explicitClubId == null ? null : Number(explicitClubId);
        if (parsedClubId != null && !Number.isNaN(parsedClubId) && parsedClubId > 0) {
            return parsedClubId;
        }
        throw new Error('A club is required for this action.');
    });
}
function ensureTeamAccess(req, teamId) {
    return __awaiter(this, void 0, void 0, function* () {
        const rows = yield db_1.db.select().from(schema_1.teams).where((0, drizzle_orm_1.eq)(schema_1.teams.id, teamId)).limit(1);
        const team = rows[0];
        if (!team) {
            return { status: 404, error: 'Team not found.' };
        }
        if (isSuperadmin(req)) {
            return { status: 200, team };
        }
        const requestClubId = getRequestClubId(req);
        if (requestClubId == null) {
            return { status: 403, error: 'Your account is not assigned to a club.' };
        }
        if (team.clubId !== requestClubId) {
            return { status: 403, error: 'You do not have access to this team.' };
        }
        return { status: 200, team };
    });
}
function mapPlayer(player) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o;
    return {
        id: player.id,
        firstName: (_a = player.firstName) !== null && _a !== void 0 ? _a : 'Unknown',
        lastName: (_b = player.lastName) !== null && _b !== void 0 ? _b : 'Player',
        name: (_c = player.name) !== null && _c !== void 0 ? _c : `${(_d = player.firstName) !== null && _d !== void 0 ? _d : 'Unknown'} ${(_e = player.lastName) !== null && _e !== void 0 ? _e : 'Player'}`.trim(),
        email: (_f = player.email) !== null && _f !== void 0 ? _f : null,
        number: (_g = player.number) !== null && _g !== void 0 ? _g : null,
        status: (_h = player.status) !== null && _h !== void 0 ? _h : 'active',
        avatarUrl: (_j = player.avatarUrl) !== null && _j !== void 0 ? _j : null,
        teamId: (_k = player.teamId) !== null && _k !== void 0 ? _k : null,
        createdAt: (_l = player.createdAt) !== null && _l !== void 0 ? _l : null,
        medicalCheckExpiry: (_m = player.medicalCheckExpiry) !== null && _m !== void 0 ? _m : null,
        birthYear: (_o = player.birthYear) !== null && _o !== void 0 ? _o : null,
    };
}
function generateInviteCode() {
    return __awaiter(this, void 0, void 0, function* () {
        for (let attempt = 0; attempt < 5; attempt += 1) {
            const inviteCode = crypto_1.default.randomBytes(3).toString('hex').toUpperCase();
            const existing = yield db_1.db.select({ id: schema_1.teams.id }).from(schema_1.teams).where((0, drizzle_orm_1.eq)(schema_1.teams.inviteCode, inviteCode)).limit(1);
            if (!existing[0]) {
                return inviteCode;
            }
        }
        throw new Error('Failed to generate a unique invite code.');
    });
}
function getTeamPlayersById(teamId) {
    return __awaiter(this, void 0, void 0, function* () {
        const [directPlayers, relationRows] = yield Promise.all([
            db_1.db.select().from(schema_1.players).where((0, drizzle_orm_1.eq)(schema_1.players.teamId, teamId)),
            db_1.db
                .select({ player: schema_1.players })
                .from(schema_1.playersToTeams)
                .innerJoin(schema_1.players, (0, drizzle_orm_1.eq)(schema_1.playersToTeams.playerId, schema_1.players.id))
                .where((0, drizzle_orm_1.eq)(schema_1.playersToTeams.teamId, teamId)),
        ]);
        const uniquePlayers = new Map();
        directPlayers.forEach((player) => uniquePlayers.set(player.id, player));
        relationRows.forEach((row) => uniquePlayers.set(row.player.id, row.player));
        return Array.from(uniquePlayers.values()).map(mapPlayer);
    });
}
function parseRouteId(value) {
    const normalized = Array.isArray(value) ? value[0] : value;
    return Number.parseInt(normalized, 10);
}
router.get('/', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        if (!req.user) {
            res.status(401).json({ error: 'Authentication is required.' });
            return;
        }
        const rows = isSuperadmin(req)
            ? yield db_1.db.select().from(schema_1.teams).orderBy((0, drizzle_orm_1.asc)(schema_1.teams.createdAt))
            : yield db_1.db
                .select()
                .from(schema_1.teams)
                .where((0, drizzle_orm_1.eq)(schema_1.teams.clubId, (_a = getRequestClubId(req)) !== null && _a !== void 0 ? _a : -1))
                .orderBy((0, drizzle_orm_1.asc)(schema_1.teams.createdAt));
        const teamIds = rows.map((team) => team.id);
        const coachIds = Array.from(new Set(rows.map((team) => team.coachId).filter((id) => id != null)));
        const [directPlayers, relationRows, coachRows] = yield Promise.all([
            teamIds.length
                ? db_1.db.select({ id: schema_1.players.id, teamId: schema_1.players.teamId, medicalCheckExpiry: schema_1.players.medicalCheckExpiry }).from(schema_1.players).where((0, drizzle_orm_1.inArray)(schema_1.players.teamId, teamIds))
                : Promise.resolve([]),
            teamIds.length
                ? db_1.db
                    .select({ teamId: schema_1.playersToTeams.teamId, playerId: schema_1.playersToTeams.playerId, medicalCheckExpiry: schema_1.players.medicalCheckExpiry })
                    .from(schema_1.playersToTeams)
                    .innerJoin(schema_1.players, (0, drizzle_orm_1.eq)(schema_1.playersToTeams.playerId, schema_1.players.id))
                    .where((0, drizzle_orm_1.inArray)(schema_1.playersToTeams.teamId, teamIds))
                : Promise.resolve([]),
            coachIds.length
                ? db_1.db.select({ id: schema_1.users.id, name: schema_1.users.name }).from(schema_1.users).where((0, drizzle_orm_1.inArray)(schema_1.users.id, coachIds))
                : Promise.resolve([]),
        ]);
        const coachMap = new Map(coachRows.map((coach) => [coach.id, coach.name]));
        const now = Date.now();
        const isMedicalCheckStale = (expiry) => !expiry || new Date(expiry).getTime() < now;
        const statsByTeam = new Map();
        const bucketFor = (teamId) => {
            let bucket = statsByTeam.get(teamId);
            if (!bucket) {
                bucket = { playerIds: new Set(), staleMedicalChecks: new Set() };
                statsByTeam.set(teamId, bucket);
            }
            return bucket;
        };
        directPlayers.forEach((player) => {
            if (player.teamId == null)
                return;
            const bucket = bucketFor(player.teamId);
            bucket.playerIds.add(player.id);
            if (isMedicalCheckStale(player.medicalCheckExpiry))
                bucket.staleMedicalChecks.add(player.id);
        });
        relationRows.forEach((row) => {
            const bucket = bucketFor(row.teamId);
            bucket.playerIds.add(row.playerId);
            if (isMedicalCheckStale(row.medicalCheckExpiry))
                bucket.staleMedicalChecks.add(row.playerId);
        });
        res.json(rows.map((team) => {
            var _a;
            const stats = statsByTeam.get(team.id);
            return Object.assign(Object.assign({}, mapTeam(team)), { coachName: team.coachId != null ? (_a = coachMap.get(team.coachId)) !== null && _a !== void 0 ? _a : null : null, playerCount: stats ? stats.playerIds.size : 0, staleMedicalChecks: stats ? stats.staleMedicalChecks.size : 0 });
        }));
    }
    catch (e) {
        console.error('[GET /api/teams] error:', e);
        res.status(500).json({ error: 'Failed to fetch teams' });
    }
}));
router.get('/coaches', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        if (!req.user) {
            res.status(401).json({ error: 'Authentication is required.' });
            return;
        }
        const rows = isSuperadmin(req)
            ? yield db_1.db.select({ id: schema_1.users.id, name: schema_1.users.name }).from(schema_1.users).where((0, drizzle_orm_1.eq)(schema_1.users.role, 'coach')).orderBy((0, drizzle_orm_1.asc)(schema_1.users.name))
            : yield db_1.db
                .select({ id: schema_1.users.id, name: schema_1.users.name })
                .from(schema_1.users)
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.users.role, 'coach'), (0, drizzle_orm_1.eq)(schema_1.users.clubId, (_a = getRequestClubId(req)) !== null && _a !== void 0 ? _a : -1)))
                .orderBy((0, drizzle_orm_1.asc)(schema_1.users.name));
        res.json(rows);
    }
    catch (e) {
        console.error('[GET /api/teams/coaches] error:', e);
        res.status(500).json({ error: 'Failed to fetch coaches' });
    }
}));
router.post('/', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        if (!req.user) {
            res.status(401).json({ error: 'Authentication is required.' });
            return;
        }
        const { frbTeamId, name, frbLeagueId, leagueName, frbSeasonId, seasonName, isCustom, gender, level, coachId } = req.body;
        const normalizedName = typeof name === 'string' ? name.trim() : '';
        const normalizedLeagueName = typeof leagueName === 'string' ? leagueName.trim() : '';
        const normalizedSeasonName = typeof seasonName === 'string' ? seasonName.trim() : '';
        const normalizedFrbTeamId = typeof frbTeamId === 'string' ? frbTeamId.trim() : '';
        const normalizedFrbLeagueId = typeof frbLeagueId === 'string' ? frbLeagueId.trim() : '';
        const normalizedFrbSeasonId = typeof frbSeasonId === 'string' ? frbSeasonId.trim() : '';
        const customTeam = isCustom === true;
        const normalizedGender = TEAM_GENDERS.includes(gender) ? gender : null;
        const normalizedLevel = TEAM_LEVELS.includes(level) ? level : null;
        const normalizedCoachId = coachId == null || coachId === '' ? null : Number(coachId);
        if (!normalizedName || !normalizedLeagueName || !normalizedSeasonName) {
            res.status(400).json({ error: 'Missing required fields' });
            return;
        }
        if (!normalizedGender) {
            res.status(400).json({ error: 'Gender is required.' });
            return;
        }
        if (!customTeam && (!normalizedFrbTeamId || !normalizedFrbLeagueId || !normalizedFrbSeasonId)) {
            res.status(400).json({ error: 'Missing FRB identifiers for imported team.' });
            return;
        }
        const clubId = yield resolveScopedClubId(req, (_a = req.body) === null || _a === void 0 ? void 0 : _a.clubId);
        const clubRows = yield db_1.db.select({ id: schema_1.clubs.id }).from(schema_1.clubs).where((0, drizzle_orm_1.eq)(schema_1.clubs.id, clubId)).limit(1);
        if (!clubRows[0]) {
            res.status(400).json({ error: 'Club not found.' });
            return;
        }
        const existingTeam = customTeam
            ? yield db_1.db
                .select()
                .from(schema_1.teams)
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.teams.name, normalizedName), (0, drizzle_orm_1.eq)(schema_1.teams.leagueName, normalizedLeagueName), (0, drizzle_orm_1.eq)(schema_1.teams.seasonName, normalizedSeasonName), (0, drizzle_orm_1.eq)(schema_1.teams.clubId, clubId)))
                .limit(1)
            : yield db_1.db
                .select()
                .from(schema_1.teams)
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.teams.frbTeamId, normalizedFrbTeamId), (0, drizzle_orm_1.eq)(schema_1.teams.frbSeasonId, normalizedFrbSeasonId), (0, drizzle_orm_1.eq)(schema_1.teams.clubId, clubId)))
                .limit(1);
        if (existingTeam[0]) {
            res.status(409).json({ error: customTeam ? 'This custom team already exists.' : 'This team is already imported for the selected season.' });
            return;
        }
        let coachName = null;
        if (normalizedCoachId != null) {
            const coachRows = yield db_1.db.select({ id: schema_1.users.id, name: schema_1.users.name }).from(schema_1.users).where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.users.id, normalizedCoachId), (0, drizzle_orm_1.eq)(schema_1.users.role, 'coach'))).limit(1);
            if (!coachRows[0]) {
                res.status(400).json({ error: 'Selected coach was not found.' });
                return;
            }
            coachName = coachRows[0].name;
        }
        const inviteCode = yield generateInviteCode();
        const inserted = yield db_1.db
            .insert(schema_1.teams)
            .values({
            frbTeamId: customTeam ? '' : normalizedFrbTeamId,
            name: normalizedName,
            frbLeagueId: customTeam ? '' : normalizedFrbLeagueId,
            leagueName: normalizedLeagueName,
            frbSeasonId: customTeam ? '' : normalizedFrbSeasonId,
            seasonName: normalizedSeasonName,
            inviteCode,
            clubId,
            gender: normalizedGender,
            level: normalizedLevel,
            coachId: normalizedCoachId,
        })
            .returning();
        res.json(Object.assign(Object.assign({}, mapTeam(inserted[0])), { coachName, playerCount: 0, staleMedicalChecks: 0 }));
    }
    catch (e) {
        console.error('[POST /api/teams] error:', e);
        res.status(500).json({ error: 'Failed to create team' });
    }
}));
router.get('/:id', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    try {
        const id = parseRouteId(req.params.id);
        if (Number.isNaN(id)) {
            res.status(400).json({ error: 'Invalid ID' });
            return;
        }
        const access = yield ensureTeamAccess(req, id);
        if (access.status !== 200) {
            res.status(access.status).json({ error: access.error });
            return;
        }
        const [teamPlayers, coachRow] = yield Promise.all([
            getTeamPlayersById(id),
            access.team.coachId != null
                ? db_1.db.select({ name: schema_1.users.name }).from(schema_1.users).where((0, drizzle_orm_1.eq)(schema_1.users.id, access.team.coachId)).limit(1)
                : Promise.resolve([]),
        ]);
        const now = Date.now();
        const staleMedicalChecks = teamPlayers.filter((player) => !player.medicalCheckExpiry || new Date(player.medicalCheckExpiry).getTime() < now).length;
        res.json(Object.assign(Object.assign({}, mapTeam(access.team)), { coachName: (_b = (_a = coachRow[0]) === null || _a === void 0 ? void 0 : _a.name) !== null && _b !== void 0 ? _b : null, playerCount: teamPlayers.length, staleMedicalChecks }));
    }
    catch (e) {
        console.error(`[GET /api/teams/${req.params.id}] error:`, e);
        res.status(500).json({ error: 'Failed to fetch team details' });
    }
}));
router.get('/:id/stats', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    try {
        const id = parseRouteId(req.params.id);
        if (Number.isNaN(id)) {
            res.status(400).json({ error: 'Invalid ID' });
            return;
        }
        const access = yield ensureTeamAccess(req, id);
        if (access.status !== 200) {
            res.status(access.status).json({ error: access.error });
            return;
        }
        const teamPlayers = yield getTeamPlayersById(id);
        const playerIds = teamPlayers.map((p) => p.id);
        const [attendanceRows, paymentRows] = yield Promise.all([
            db_1.db.select().from(schema_1.attendance).where((0, drizzle_orm_1.eq)(schema_1.attendance.teamId, id)),
            playerIds.length
                ? db_1.db.select().from(schema_1.playerPayments).where((0, drizzle_orm_1.inArray)(schema_1.playerPayments.playerId, playerIds))
                : Promise.resolve([]),
        ]);
        const now = new Date();
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
        const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const rateOf = (rows) => rows.length === 0 ? null : Math.round((rows.filter((r) => isAttendancePresent(r.status)).length / rows.length) * 1000) / 10;
        const monthRows = attendanceRows.filter((r) => r.date && new Date(r.date) >= monthStart);
        const prevMonthRows = attendanceRows.filter((r) => r.date && new Date(r.date) >= prevMonthStart && new Date(r.date) < monthStart);
        const attByPlayer = new Map();
        for (const row of attendanceRows) {
            const bucket = (_a = attByPlayer.get(row.playerId)) !== null && _a !== void 0 ? _a : { present: 0, total: 0, monthPresent: 0, monthTotal: 0 };
            bucket.total += 1;
            if (isAttendancePresent(row.status))
                bucket.present += 1;
            if (row.date && new Date(row.date) >= monthStart) {
                bucket.monthTotal += 1;
                if (isAttendancePresent(row.status))
                    bucket.monthPresent += 1;
            }
            attByPlayer.set(row.playerId, bucket);
        }
        const paymentsByPlayer = new Map();
        for (const row of paymentRows) {
            const list = (_b = paymentsByPlayer.get(row.playerId)) !== null && _b !== void 0 ? _b : [];
            list.push(row);
            paymentsByPlayer.set(row.playerId, list);
        }
        let playersWithArrears = 0;
        let totalOutstanding = 0;
        const playerStats = teamPlayers.map((player) => {
            var _a, _b, _c;
            const att = attByPlayer.get(player.id);
            const attendanceRate = att && att.total > 0 ? Math.round((att.present / att.total) * 100) : null;
            const monthlyRate = att && att.monthTotal > 0 ? Math.round((att.monthPresent / att.monthTotal) * 100) : null;
            const payments = (_a = paymentsByPlayer.get(player.id)) !== null && _a !== void 0 ? _a : [];
            const unpaid = payments.filter((row) => !isPaidStatus(row.status));
            const outstandingAmount = unpaid.reduce((sum, row) => { var _a; return sum + Number((_a = row.amount) !== null && _a !== void 0 ? _a : 0); }, 0);
            const latest = [...payments].sort((a, b) => { var _a, _b, _c, _d; return new Date((_b = (_a = b.date) !== null && _a !== void 0 ? _a : b.createdAt) !== null && _b !== void 0 ? _b : 0).getTime() - new Date((_d = (_c = a.date) !== null && _c !== void 0 ? _c : a.createdAt) !== null && _d !== void 0 ? _d : 0).getTime(); })[0];
            const paymentStatus = latest ? (isPaidStatus(latest.status) ? 'paid' : 'due') : 'none';
            if (outstandingAmount > 0) {
                playersWithArrears += 1;
                totalOutstanding += outstandingAmount;
            }
            return {
                playerId: player.id,
                attendanceRate,
                present: (_b = att === null || att === void 0 ? void 0 : att.present) !== null && _b !== void 0 ? _b : 0,
                total: (_c = att === null || att === void 0 ? void 0 : att.total) !== null && _c !== void 0 ? _c : 0,
                monthlyRate,
                paymentStatus,
                outstandingAmount,
            };
        });
        res.json({
            monthlyAttendanceRate: rateOf(monthRows),
            previousMonthAttendanceRate: rateOf(prevMonthRows),
            overallAttendanceRate: rateOf(attendanceRows),
            playersWithArrears,
            totalOutstanding,
            players: playerStats,
        });
    }
    catch (e) {
        console.error(`[GET /api/teams/${req.params.id}/stats] error:`, e);
        res.status(500).json({ error: 'Failed to fetch team stats' });
    }
}));
router.delete('/:id', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const id = parseRouteId(req.params.id);
        if (Number.isNaN(id)) {
            res.status(400).json({ error: 'Invalid ID' });
            return;
        }
        const access = yield ensureTeamAccess(req, id);
        if (access.status !== 200) {
            res.status(access.status).json({ error: access.error });
            return;
        }
        yield db_1.db.transaction((tx) => __awaiter(void 0, void 0, void 0, function* () {
            const eventRows = yield tx
                .select({ id: schema_1.events.id })
                .from(schema_1.events)
                .where((0, drizzle_orm_1.eq)(schema_1.events.teamId, id));
            const eventIds = eventRows.map((event) => event.id);
            yield tx.delete(schema_1.attendance).where((0, drizzle_orm_1.eq)(schema_1.attendance.teamId, id));
            if (eventIds.length > 0) {
                yield tx.delete(schema_1.attendance).where((0, drizzle_orm_1.inArray)(schema_1.attendance.eventId, eventIds));
            }
            yield tx.delete(schema_1.events).where((0, drizzle_orm_1.eq)(schema_1.events.teamId, id));
            yield tx.delete(schema_1.l12Documents).where((0, drizzle_orm_1.eq)(schema_1.l12Documents.teamId, id));
            yield tx.delete(schema_1.playersToTeams).where((0, drizzle_orm_1.eq)(schema_1.playersToTeams.teamId, id));
            yield tx.update(schema_1.players).set({ teamId: null }).where((0, drizzle_orm_1.eq)(schema_1.players.teamId, id));
            yield tx.delete(schema_1.teams).where((0, drizzle_orm_1.eq)(schema_1.teams.id, id));
        }));
        res.json({ success: true });
    }
    catch (e) {
        console.error(`[DELETE /api/teams/${req.params.id}] error:`, e);
        res.status(500).json({ error: 'Failed to delete team' });
    }
}));
router.patch('/:id', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c;
    try {
        const id = parseRouteId(req.params.id);
        if (Number.isNaN(id)) {
            res.status(400).json({ error: 'Invalid ID' });
            return;
        }
        const access = yield ensureTeamAccess(req, id);
        if (access.status !== 200) {
            res.status(access.status).json({ error: access.error });
            return;
        }
        const body = (_a = req.body) !== null && _a !== void 0 ? _a : {};
        const updates = { updatedAt: new Date().toISOString() };
        if (typeof body.name === 'string' && body.name.trim()) {
            updates.name = body.name.trim();
        }
        if (TEAM_GENDERS.includes(body.gender)) {
            updates.gender = body.gender;
        }
        if (TEAM_LEVELS.includes(body.level)) {
            updates.level = body.level;
        }
        if (typeof body.isActive === 'boolean') {
            updates.isActive = body.isActive;
        }
        if ('coachId' in body) {
            const nextCoachId = body.coachId == null || body.coachId === '' ? null : Number(body.coachId);
            if (nextCoachId != null) {
                const coachRows = yield db_1.db.select({ id: schema_1.users.id }).from(schema_1.users).where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.users.id, nextCoachId), (0, drizzle_orm_1.eq)(schema_1.users.role, 'coach'))).limit(1);
                if (!coachRows[0]) {
                    res.status(400).json({ error: 'Selected coach was not found.' });
                    return;
                }
            }
            updates.coachId = nextCoachId;
        }
        const updated = yield db_1.db.update(schema_1.teams).set(updates).where((0, drizzle_orm_1.eq)(schema_1.teams.id, id)).returning();
        const [teamPlayers, coachRow] = yield Promise.all([
            getTeamPlayersById(id),
            updated[0].coachId != null
                ? db_1.db.select({ name: schema_1.users.name }).from(schema_1.users).where((0, drizzle_orm_1.eq)(schema_1.users.id, updated[0].coachId)).limit(1)
                : Promise.resolve([]),
        ]);
        const now = Date.now();
        const staleMedicalChecks = teamPlayers.filter((player) => !player.medicalCheckExpiry || new Date(player.medicalCheckExpiry).getTime() < now).length;
        res.json(Object.assign(Object.assign({}, mapTeam(updated[0])), { coachName: (_c = (_b = coachRow[0]) === null || _b === void 0 ? void 0 : _b.name) !== null && _c !== void 0 ? _c : null, playerCount: teamPlayers.length, staleMedicalChecks }));
    }
    catch (e) {
        console.error(`[PATCH /api/teams/${req.params.id}] error:`, e);
        res.status(500).json({ error: 'Failed to update team' });
    }
}));
router.get('/:id/players', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const id = parseRouteId(req.params.id);
        if (Number.isNaN(id)) {
            res.status(400).json({ error: 'Invalid ID' });
            return;
        }
        const access = yield ensureTeamAccess(req, id);
        if (access.status !== 200) {
            res.status(access.status).json({ error: access.error });
            return;
        }
        const teamPlayers = yield getTeamPlayersById(id);
        res.json(teamPlayers);
    }
    catch (e) {
        console.error(`[GET /api/teams/${req.params.id}/players] error:`, e);
        res.status(500).json({ error: 'Failed to fetch players' });
    }
}));
router.post('/:id/players', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const teamId = parseRouteId(req.params.id);
        if (Number.isNaN(teamId)) {
            res.status(400).json({ error: 'Invalid ID' });
            return;
        }
        const access = yield ensureTeamAccess(req, teamId);
        if (access.status !== 200) {
            res.status(access.status).json({ error: access.error });
            return;
        }
        const { name, firstName: inputFirstName, lastName: inputLastName, status, avatarUrl } = req.body;
        let firstName = inputFirstName;
        let lastName = inputLastName;
        if (name && (!firstName || !lastName)) {
            const parts = String(name).trim().split(' ');
            firstName = firstName || parts[0];
            lastName = lastName || (parts.length > 1 ? parts.slice(1).join(' ') : 'Player');
        }
        if (!firstName || !lastName) {
            res.status(400).json({ error: 'First name and last name are required' });
            return;
        }
        const insertedPlayers = yield db_1.db
            .insert(schema_1.players)
            .values({
            name: name || `${firstName} ${lastName}`,
            firstName,
            lastName,
            status: status || 'active',
            avatarUrl: avatarUrl || null,
            teamId,
        })
            .returning();
        const insertedPlayer = insertedPlayers[0];
        yield db_1.db.insert(schema_1.playersToTeams).values({
            playerId: insertedPlayer.id,
            teamId,
        });
        res.json(mapPlayer(insertedPlayer));
    }
    catch (e) {
        console.error(`[POST /api/teams/${req.params.id}/players] error:`, e);
        res.status(500).json({ error: 'Failed to create player' });
    }
}));
router.delete('/:id/players/:playerId', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const teamId = parseRouteId(req.params.id);
        const playerId = parseRouteId(req.params.playerId);
        if (Number.isNaN(teamId) || Number.isNaN(playerId)) {
            res.status(400).json({ error: 'Invalid ID' });
            return;
        }
        const access = yield ensureTeamAccess(req, teamId);
        if (access.status !== 200) {
            res.status(access.status).json({ error: access.error });
            return;
        }
        yield db_1.db.transaction((tx) => __awaiter(void 0, void 0, void 0, function* () {
            yield tx.delete(schema_1.playersToTeams).where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.playersToTeams.teamId, teamId), (0, drizzle_orm_1.eq)(schema_1.playersToTeams.playerId, playerId)));
            yield tx.update(schema_1.players).set({ teamId: null }).where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.players.id, playerId), (0, drizzle_orm_1.eq)(schema_1.players.teamId, teamId)));
        }));
        res.json({ success: true });
    }
    catch (e) {
        console.error(`[DELETE /api/teams/${req.params.id}/players/${req.params.playerId}] error:`, e);
        res.status(500).json({ error: 'Failed to remove player from team' });
    }
}));
exports.default = router;
