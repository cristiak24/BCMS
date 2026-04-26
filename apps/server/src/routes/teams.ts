import { Router } from 'express';
import { admin, firestore, nextNumericId, toIso } from '../lib/firebaseAdmin';
import crypto from 'crypto';

type TeamDoc = {
    id: number;
    frbTeamId: string;
    name: string;
    frbLeagueId: string;
    leagueName: string;
    frbSeasonId: string;
    seasonName: string;
    inviteCode: string;
    createdAt?: FirebaseFirestore.Timestamp | Date | string | null;
    updatedAt?: FirebaseFirestore.Timestamp | Date | string | null;
    clubId?: number | null;
    createdBy?: string | null;
};

type PlayerDoc = {
    id: number;
    firstName: string;
    lastName: string;
    name?: string | null;
    email?: string | null;
    number?: number | null;
    status?: string | null;
    avatarUrl?: string | null;
    medicalCheckExpiry?: FirebaseFirestore.Timestamp | Date | string | null;
    birthYear?: number | null;
    teamId?: number | null;
    createdAt?: FirebaseFirestore.Timestamp | Date | string | null;
    updatedAt?: FirebaseFirestore.Timestamp | Date | string | null;
};

const router = Router();

async function getTeamPlayersById(teamId: number) {
    const playersSnap = await firestore.collection('players').where('teamId', '==', teamId).get();
    const playerDocs = playersSnap.docs.map((docSnap) => docSnap.data() as PlayerDoc);

    const joinSnap = await firestore.collection('playersToTeams').where('teamId', '==', teamId).get();
    const joinPlayerIds = joinSnap.docs.map((docSnap) => Number((docSnap.data() as { playerId: number }).playerId));

    if (joinPlayerIds.length > 0) {
        const extraPlayersSnap = await firestore.collection('players').where('id', 'in', joinPlayerIds.slice(0, 10)).get();
        extraPlayersSnap.docs.forEach((docSnap) => {
            const player = docSnap.data() as PlayerDoc;
            if (!playerDocs.some((existing) => existing.id === player.id)) {
                playerDocs.push(player);
            }
        });
    }

    return Array.from(new Map(playerDocs.map((player) => [player.id, player])).values()).map((player) => ({
        id: player.id,
        firstName: player.firstName,
        lastName: player.lastName,
        name: player.name ?? `${player.firstName} ${player.lastName}`.trim(),
        email: player.email ?? null,
        number: player.number ?? null,
        status: player.status ?? 'active',
        avatarUrl: player.avatarUrl ?? null,
        teamId: player.teamId ?? null,
        createdAt: toIso(player.createdAt) ?? null,
        medicalCheckExpiry: toIso(player.medicalCheckExpiry) ?? null,
        birthYear: player.birthYear ?? null,
    }));
}

// GET /api/teams
router.get('/', async (_req, res) => {
    try {
        const snap = await firestore.collection('teams').orderBy('createdAt', 'asc').get();
        const allTeams = snap.docs.map((docSnap) => docSnap.data() as TeamDoc).map((team) => ({
            ...team,
            createdAt: toIso(team.createdAt) ?? new Date().toISOString(),
        }));
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

        const inviteCode = crypto.randomBytes(3).toString('hex').toUpperCase();
        const id = await nextNumericId('teams');
        const team: TeamDoc = {
            id,
            frbTeamId,
            name,
            frbLeagueId,
            leagueName,
            frbSeasonId,
            seasonName,
            inviteCode,
            createdAt: new Date(),
            updatedAt: new Date(),
            createdBy: null,
        };

        await firestore.collection('teams').doc(String(id)).set(team);
        res.json({ ...team, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
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

        const snap = await firestore.collection('teams').doc(String(id)).get();
        if (!snap.exists) {
            res.status(404).json({ error: 'Team not found' });
            return;
        }

        const team = snap.data() as TeamDoc;
        res.json({ ...team, createdAt: toIso(team.createdAt) ?? null, updatedAt: toIso(team.updatedAt) ?? null });
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

        const batch = firestore.batch();
        const joinsSnap = await firestore.collection('playersToTeams').where('teamId', '==', id).get();
        joinsSnap.docs.forEach((docSnap) => batch.delete(docSnap.ref));

        const playersSnap = await firestore.collection('players').where('teamId', '==', id).get();
        playersSnap.docs.forEach((docSnap) => batch.set(docSnap.ref, { teamId: null }, { merge: true }));

        batch.delete(firestore.collection('teams').doc(String(id)));
        await batch.commit();

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

        const teamPlayers = await getTeamPlayersById(id);
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

        const id = await nextNumericId('players');
        const player: PlayerDoc = {
            id,
            name: name || `${firstName} ${lastName}`,
            firstName,
            lastName,
            status: status || 'active',
            avatarUrl: avatarUrl || null,
            teamId,
            createdAt: new Date(),
            updatedAt: new Date(),
        };

        await firestore.collection('players').doc(String(id)).set(player);
        const relationId = await nextNumericId('playersToTeams');
        await firestore.collection('playersToTeams').doc(String(relationId)).set({
            id: relationId,
            playerId: id,
            teamId,
        });

        res.json({ ...player, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
    } catch (e) {
        console.error(`[POST /api/teams/${req.params.id}/players] error:`, e);
        res.status(500).json({ error: 'Failed to create player' });
    }
});

export default router;
