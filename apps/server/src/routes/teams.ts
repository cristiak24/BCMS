import { Router } from 'express';
import { db } from '../db';
import { teams, players, playersToTeams } from '../db/schema';
import { eq, or } from 'drizzle-orm';
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

        // Delete relationships first
        await db.delete(playersToTeams).where(eq(playersToTeams.teamId, id));
        
        // Also old legacy way: set teamId to null for players directly referencing this team
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

        // Get players from BOTH the legacy teamId column and the new join table
        // We'll use a subquery or just a join. A join is better.
        const teamPlayers = await db.select({
            id: players.id,
            firstName: players.firstName,
            lastName: players.lastName,
            name: players.name,
            email: players.email,
            number: players.number,
            status: players.status,
            avatarUrl: players.avatarUrl,
            teamId: players.teamId,
            createdAt: players.createdAt
        })
        .from(players)
        .leftJoin(playersToTeams, eq(players.id, playersToTeams.playerId))
        .where(
            or(
                eq(players.teamId, id),
                eq(playersToTeams.teamId, id)
            )
        );

        // Remove duplicates if any (though there shouldn't be if logic is correct)
        const uniquePlayers = Array.from(new Map(teamPlayers.map(p => [p.id, p])).values());

        res.json(uniquePlayers);
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

        const { name, firstName: inputFirstName, lastName: inputLastName, status, avatarUrl } = req.body;
        
        let firstName = inputFirstName;
        let lastName = inputLastName;

        // Backward compatibility: if name is provided but not firstName/lastName
        if (name && (!firstName || !lastName)) {
            const parts = name.trim().split(' ');
            firstName = firstName || parts[0];
            lastName = lastName || (parts.length > 1 ? parts.slice(1).join(' ') : 'Player');
        }

        if (!firstName || !lastName) {
            res.status(400).json({ error: 'First name and last name are required' });
            return;
        }

        const newPlayer = await db.insert(players).values({
            name: name || `${firstName} ${lastName}`,
            firstName,
            lastName,
            status: status || 'active',
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
