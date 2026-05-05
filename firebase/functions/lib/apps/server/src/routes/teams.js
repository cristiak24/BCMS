"use strict";
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
function mapTeam(team) {
    return {
        ...team,
        createdAt: team.createdAt ?? new Date().toISOString(),
    };
}
function getRequestClubId(req) {
    return req.user?.clubId == null ? null : Number(req.user.clubId);
}
function isSuperadmin(req) {
    return req.user?.role === 'superadmin';
}
async function resolveScopedClubId(req, explicitClubId) {
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
}
async function ensureTeamAccess(req, teamId) {
    const rows = await db_1.db.select().from(schema_1.teams).where((0, drizzle_orm_1.eq)(schema_1.teams.id, teamId)).limit(1);
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
}
function mapPlayer(player) {
    return {
        id: player.id,
        firstName: player.firstName ?? 'Unknown',
        lastName: player.lastName ?? 'Player',
        name: player.name ?? `${player.firstName ?? 'Unknown'} ${player.lastName ?? 'Player'}`.trim(),
        email: player.email ?? null,
        number: player.number ?? null,
        status: player.status ?? 'active',
        avatarUrl: player.avatarUrl ?? null,
        teamId: player.teamId ?? null,
        createdAt: player.createdAt ?? null,
        medicalCheckExpiry: player.medicalCheckExpiry ?? null,
        birthYear: player.birthYear ?? null,
    };
}
async function generateInviteCode() {
    for (let attempt = 0; attempt < 5; attempt += 1) {
        const inviteCode = crypto_1.default.randomBytes(3).toString('hex').toUpperCase();
        const existing = await db_1.db.select({ id: schema_1.teams.id }).from(schema_1.teams).where((0, drizzle_orm_1.eq)(schema_1.teams.inviteCode, inviteCode)).limit(1);
        if (!existing[0]) {
            return inviteCode;
        }
    }
    throw new Error('Failed to generate a unique invite code.');
}
async function getTeamPlayersById(teamId) {
    const [directPlayers, relationRows] = await Promise.all([
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
}
function parseRouteId(value) {
    const normalized = Array.isArray(value) ? value[0] : value;
    return Number.parseInt(normalized, 10);
}
router.get('/', async (req, res) => {
    try {
        if (!req.user) {
            res.status(401).json({ error: 'Authentication is required.' });
            return;
        }
        const rows = isSuperadmin(req)
            ? await db_1.db.select().from(schema_1.teams).orderBy((0, drizzle_orm_1.asc)(schema_1.teams.createdAt))
            : await db_1.db
                .select()
                .from(schema_1.teams)
                .where((0, drizzle_orm_1.eq)(schema_1.teams.clubId, getRequestClubId(req) ?? -1))
                .orderBy((0, drizzle_orm_1.asc)(schema_1.teams.createdAt));
        res.json(rows.map(mapTeam));
    }
    catch (e) {
        console.error('[GET /api/teams] error:', e);
        res.status(500).json({ error: 'Failed to fetch teams' });
    }
});
router.post('/', async (req, res) => {
    try {
        if (!req.user) {
            res.status(401).json({ error: 'Authentication is required.' });
            return;
        }
        const { frbTeamId, name, frbLeagueId, leagueName, frbSeasonId, seasonName, isCustom } = req.body;
        const normalizedName = typeof name === 'string' ? name.trim() : '';
        const normalizedLeagueName = typeof leagueName === 'string' ? leagueName.trim() : '';
        const normalizedSeasonName = typeof seasonName === 'string' ? seasonName.trim() : '';
        const normalizedFrbTeamId = typeof frbTeamId === 'string' ? frbTeamId.trim() : '';
        const normalizedFrbLeagueId = typeof frbLeagueId === 'string' ? frbLeagueId.trim() : '';
        const normalizedFrbSeasonId = typeof frbSeasonId === 'string' ? frbSeasonId.trim() : '';
        const customTeam = isCustom === true;
        if (!normalizedName || !normalizedLeagueName || !normalizedSeasonName) {
            res.status(400).json({ error: 'Missing required fields' });
            return;
        }
        if (!customTeam && (!normalizedFrbTeamId || !normalizedFrbLeagueId || !normalizedFrbSeasonId)) {
            res.status(400).json({ error: 'Missing FRB identifiers for imported team.' });
            return;
        }
        const clubId = await resolveScopedClubId(req, req.body?.clubId);
        const clubRows = await db_1.db.select({ id: schema_1.clubs.id }).from(schema_1.clubs).where((0, drizzle_orm_1.eq)(schema_1.clubs.id, clubId)).limit(1);
        if (!clubRows[0]) {
            res.status(400).json({ error: 'Club not found.' });
            return;
        }
        const existingTeam = customTeam
            ? await db_1.db
                .select()
                .from(schema_1.teams)
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.teams.name, normalizedName), (0, drizzle_orm_1.eq)(schema_1.teams.leagueName, normalizedLeagueName), (0, drizzle_orm_1.eq)(schema_1.teams.seasonName, normalizedSeasonName), (0, drizzle_orm_1.eq)(schema_1.teams.clubId, clubId)))
                .limit(1)
            : await db_1.db
                .select()
                .from(schema_1.teams)
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.teams.frbTeamId, normalizedFrbTeamId), (0, drizzle_orm_1.eq)(schema_1.teams.frbSeasonId, normalizedFrbSeasonId), (0, drizzle_orm_1.eq)(schema_1.teams.clubId, clubId)))
                .limit(1);
        if (existingTeam[0]) {
            res.status(409).json({ error: customTeam ? 'This custom team already exists.' : 'This team is already imported for the selected season.' });
            return;
        }
        const inviteCode = await generateInviteCode();
        const inserted = await db_1.db
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
        })
            .returning();
        res.json(mapTeam(inserted[0]));
    }
    catch (e) {
        console.error('[POST /api/teams] error:', e);
        res.status(500).json({ error: 'Failed to create team' });
    }
});
router.get('/:id', async (req, res) => {
    try {
        const id = parseRouteId(req.params.id);
        if (Number.isNaN(id)) {
            res.status(400).json({ error: 'Invalid ID' });
            return;
        }
        const access = await ensureTeamAccess(req, id);
        if (access.status !== 200) {
            res.status(access.status).json({ error: access.error });
            return;
        }
        res.json(mapTeam(access.team));
    }
    catch (e) {
        console.error(`[GET /api/teams/${req.params.id}] error:`, e);
        res.status(500).json({ error: 'Failed to fetch team details' });
    }
});
router.delete('/:id', async (req, res) => {
    try {
        const id = parseRouteId(req.params.id);
        if (Number.isNaN(id)) {
            res.status(400).json({ error: 'Invalid ID' });
            return;
        }
        const access = await ensureTeamAccess(req, id);
        if (access.status !== 200) {
            res.status(access.status).json({ error: access.error });
            return;
        }
        await db_1.db.transaction(async (tx) => {
            const eventRows = await tx
                .select({ id: schema_1.events.id })
                .from(schema_1.events)
                .where((0, drizzle_orm_1.eq)(schema_1.events.teamId, id));
            const eventIds = eventRows.map((event) => event.id);
            await tx.delete(schema_1.attendance).where((0, drizzle_orm_1.eq)(schema_1.attendance.teamId, id));
            if (eventIds.length > 0) {
                await tx.delete(schema_1.attendance).where((0, drizzle_orm_1.inArray)(schema_1.attendance.eventId, eventIds));
            }
            await tx.delete(schema_1.events).where((0, drizzle_orm_1.eq)(schema_1.events.teamId, id));
            await tx.delete(schema_1.l12Documents).where((0, drizzle_orm_1.eq)(schema_1.l12Documents.teamId, id));
            await tx.delete(schema_1.playersToTeams).where((0, drizzle_orm_1.eq)(schema_1.playersToTeams.teamId, id));
            await tx.update(schema_1.players).set({ teamId: null }).where((0, drizzle_orm_1.eq)(schema_1.players.teamId, id));
            await tx.delete(schema_1.teams).where((0, drizzle_orm_1.eq)(schema_1.teams.id, id));
        });
        res.json({ success: true });
    }
    catch (e) {
        console.error(`[DELETE /api/teams/${req.params.id}] error:`, e);
        res.status(500).json({ error: 'Failed to delete team' });
    }
});
router.get('/:id/players', async (req, res) => {
    try {
        const id = parseRouteId(req.params.id);
        if (Number.isNaN(id)) {
            res.status(400).json({ error: 'Invalid ID' });
            return;
        }
        const access = await ensureTeamAccess(req, id);
        if (access.status !== 200) {
            res.status(access.status).json({ error: access.error });
            return;
        }
        const teamPlayers = await getTeamPlayersById(id);
        res.json(teamPlayers);
    }
    catch (e) {
        console.error(`[GET /api/teams/${req.params.id}/players] error:`, e);
        res.status(500).json({ error: 'Failed to fetch players' });
    }
});
router.post('/:id/players', async (req, res) => {
    try {
        const teamId = parseRouteId(req.params.id);
        if (Number.isNaN(teamId)) {
            res.status(400).json({ error: 'Invalid ID' });
            return;
        }
        const access = await ensureTeamAccess(req, teamId);
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
        const insertedPlayers = await db_1.db
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
        await db_1.db.insert(schema_1.playersToTeams).values({
            playerId: insertedPlayer.id,
            teamId,
        });
        res.json(mapPlayer(insertedPlayer));
    }
    catch (e) {
        console.error(`[POST /api/teams/${req.params.id}/players] error:`, e);
        res.status(500).json({ error: 'Failed to create player' });
    }
});
exports.default = router;
