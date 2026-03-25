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
const db_1 = require("../db");
const schema_1 = require("../db/schema");
const drizzle_orm_1 = require("drizzle-orm");
const crypto_1 = __importDefault(require("crypto"));
const router = (0, express_1.Router)();
// GET /api/teams
router.get('/', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const allTeams = yield db_1.db.select().from(schema_1.teams).orderBy(schema_1.teams.createdAt);
        res.json(allTeams);
    }
    catch (e) {
        console.error('[GET /api/teams] error:', e);
        res.status(500).json({ error: 'Failed to fetch teams' });
    }
}));
// POST /api/teams
router.post('/', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { frbTeamId, name, frbLeagueId, leagueName, frbSeasonId, seasonName } = req.body;
        if (!frbTeamId || !name || !frbLeagueId || !leagueName || !frbSeasonId || !seasonName) {
            res.status(400).json({ error: 'Missing required fields' });
            return;
        }
        // Generate a 6-character hex invite code
        const inviteCode = crypto_1.default.randomBytes(3).toString('hex').toUpperCase();
        const newTeam = yield db_1.db.insert(schema_1.teams).values({
            frbTeamId,
            name,
            frbLeagueId,
            leagueName,
            frbSeasonId,
            seasonName,
            inviteCode,
        }).returning();
        res.json(newTeam[0]);
    }
    catch (e) {
        console.error('[POST /api/teams] error:', e);
        res.status(500).json({ error: 'Failed to create team' });
    }
}));
// GET /api/teams/:id
router.get('/:id', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const id = parseInt(req.params.id, 10);
        if (isNaN(id)) {
            res.status(400).json({ error: 'Invalid ID' });
            return;
        }
        const team = yield db_1.db.select().from(schema_1.teams).where((0, drizzle_orm_1.eq)(schema_1.teams.id, id));
        if (team.length === 0) {
            res.status(404).json({ error: 'Team not found' });
            return;
        }
        res.json(team[0]);
    }
    catch (e) {
        console.error(`[GET /api/teams/${req.params.id}] error:`, e);
        res.status(500).json({ error: 'Failed to fetch team details' });
    }
}));
// DELETE /api/teams/:id
router.delete('/:id', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const id = parseInt(req.params.id, 10);
        if (isNaN(id)) {
            res.status(400).json({ error: 'Invalid ID' });
            return;
        }
        // Delete players associated with this team first (or set teamId to null depending on your policy).
        // Let's set teamId to null for now rather than deleting players permanently.
        yield db_1.db.update(schema_1.players).set({ teamId: null }).where((0, drizzle_orm_1.eq)(schema_1.players.teamId, id));
        // Delete the team
        yield db_1.db.delete(schema_1.teams).where((0, drizzle_orm_1.eq)(schema_1.teams.id, id));
        res.json({ success: true });
    }
    catch (e) {
        console.error(`[DELETE /api/teams/${req.params.id}] error:`, e);
        res.status(500).json({ error: 'Failed to delete team' });
    }
}));
// GET /api/teams/:id/players
router.get('/:id/players', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const id = parseInt(req.params.id, 10);
        if (isNaN(id)) {
            res.status(400).json({ error: 'Invalid ID' });
            return;
        }
        const teamPlayers = yield db_1.db.select().from(schema_1.players).where((0, drizzle_orm_1.eq)(schema_1.players.teamId, id));
        res.json(teamPlayers);
    }
    catch (e) {
        console.error(`[GET /api/teams/${req.params.id}/players] error:`, e);
        res.status(500).json({ error: 'Failed to fetch players' });
    }
}));
// POST /api/teams/:id/players
router.post('/:id/players', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const teamId = parseInt(req.params.id, 10);
        if (isNaN(teamId)) {
            res.status(400).json({ error: 'Invalid ID' });
            return;
        }
        const { name, position, status, avatarUrl } = req.body;
        if (!name) {
            res.status(400).json({ error: 'Name is required' });
            return;
        }
        const newPlayer = yield db_1.db.insert(schema_1.players).values({
            name,
            position,
            status,
            avatarUrl,
            teamId,
        }).returning();
        res.json(newPlayer[0]);
    }
    catch (e) {
        console.error(`[POST /api/teams/${req.params.id}/players] error:`, e);
        res.status(500).json({ error: 'Failed to create player' });
    }
}));
exports.default = router;
