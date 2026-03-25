import { Router } from 'express';
import { db } from '../db';
import { teams, players } from '../db/schema';
import { eq } from 'drizzle-orm';
import crypto from 'crypto';

const router = Router();

// GET /api/teams
router.get('/', async (req, res) => {
    try {
        const allTeams = await db.select().from(teams).orderBy(teams.createdAt);
        res.json(allTeams);
    } catch (e) {
        console.error('[GET /api/teams] error:', e);
        res.status(500).json({ error: 'Failed to fetch teams' });
    }
});

// POST /api/teams
router.post('/', async (req, res) => {
    try {
        const { frbTeamId, name, frbLeagueId, leagueName, frbSeasonId, seasonName } = req.body;
        if (!frbTeamId || !name || !frbLeagueId || !leagueName || !frbSeasonId || !seasonName) {
            res.status(400).json({ error: 'Missing required fields' });
            return;
        }

        // Generate a 6-character hex invite code
        const inviteCode = crypto.randomBytes(3).toString('hex').toUpperCase();

        const newTeam = await db.insert(teams).values({
            frbTeamId,
            name,
            frbLeagueId,
            leagueName,
            frbSeasonId,
            seasonName,
            inviteCode,
        }).returning();

        res.json(newTeam[0]);
    } catch (e) {
        console.error('[POST /api/teams] error:', e);
        res.status(500).json({ error: 'Failed to create team' });
    }
});

// GET /api/teams/:id
router.get('/:id', async (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);
        if (isNaN(id)) {
            res.status(400).json({ error: 'Invalid ID' });
            return;
        }

        const team = await db.select().from(teams).where(eq(teams.id, id));
        if (team.length === 0) {
            res.status(404).json({ error: 'Team not found' });
            return;
        }

        res.json(team[0]);
    } catch (e) {
        console.error(`[GET /api/teams/${req.params.id}] error:`, e);
        res.status(500).json({ error: 'Failed to fetch team details' });
    }
});

// DELETE /api/teams/:id
router.delete('/:id', async (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);
        if (isNaN(id)) {
            res.status(400).json({ error: 'Invalid ID' });
            return;
        }

        // Delete players associated with this team first (or set teamId to null depending on your policy).
        // Let's set teamId to null for now rather than deleting players permanently.
        await db.update(players).set({ teamId: null }).where(eq(players.teamId, id));
        
        // Delete the team
        await db.delete(teams).where(eq(teams.id, id));
        res.json({ success: true });
    } catch (e) {
        console.error(`[DELETE /api/teams/${req.params.id}] error:`, e);
        res.status(500).json({ error: 'Failed to delete team' });
    }
});

// GET /api/teams/:id/players
router.get('/:id/players', async (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);
        if (isNaN(id)) {
            res.status(400).json({ error: 'Invalid ID' });
            return;
        }

        const teamPlayers = await db.select().from(players).where(eq(players.teamId, id));
        res.json(teamPlayers);
    } catch (e) {
        console.error(`[GET /api/teams/${req.params.id}/players] error:`, e);
        res.status(500).json({ error: 'Failed to fetch players' });
    }
});

// POST /api/teams/:id/players
router.post('/:id/players', async (req, res) => {
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

        const newPlayer = await db.insert(players).values({
            name,
            position,
            status,
            avatarUrl,
            teamId,
        }).returning();

        res.json(newPlayer[0]);
    } catch (e) {
        console.error(`[POST /api/teams/${req.params.id}/players] error:`, e);
        res.status(500).json({ error: 'Failed to create player' });
    }
});

export default router;
