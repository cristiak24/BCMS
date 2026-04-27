"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const firebaseAdmin_1 = require("../lib/firebaseAdmin");
const crypto_1 = __importDefault(require("crypto"));
const router = (0, express_1.Router)();
async function getTeamPlayersById(teamId) {
    const playersSnap = await firebaseAdmin_1.firestore.collection('players').where('teamId', '==', teamId).get();
    const playerDocs = playersSnap.docs.map((docSnap) => docSnap.data());
    const joinSnap = await firebaseAdmin_1.firestore.collection('playersToTeams').where('teamId', '==', teamId).get();
    const joinPlayerIds = joinSnap.docs.map((docSnap) => Number(docSnap.data().playerId));
    if (joinPlayerIds.length > 0) {
        const extraPlayersSnap = await firebaseAdmin_1.firestore.collection('players').where('id', 'in', joinPlayerIds.slice(0, 10)).get();
        extraPlayersSnap.docs.forEach((docSnap) => {
            const player = docSnap.data();
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
        createdAt: (0, firebaseAdmin_1.toIso)(player.createdAt) ?? null,
        medicalCheckExpiry: (0, firebaseAdmin_1.toIso)(player.medicalCheckExpiry) ?? null,
        birthYear: player.birthYear ?? null,
    }));
}
// GET /api/teams
router.get('/', async (_req, res) => {
    try {
        const snap = await firebaseAdmin_1.firestore.collection('teams').orderBy('createdAt', 'asc').get();
        const allTeams = snap.docs.map((docSnap) => docSnap.data()).map((team) => ({
            ...team,
            createdAt: (0, firebaseAdmin_1.toIso)(team.createdAt) ?? new Date().toISOString(),
        }));
        res.json(allTeams);
    }
    catch (e) {
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
        const inviteCode = crypto_1.default.randomBytes(3).toString('hex').toUpperCase();
        const id = await (0, firebaseAdmin_1.nextNumericId)('teams');
        const team = {
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
        await firebaseAdmin_1.firestore.collection('teams').doc(String(id)).set(team);
        res.json({ ...team, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
    }
    catch (e) {
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
        const snap = await firebaseAdmin_1.firestore.collection('teams').doc(String(id)).get();
        if (!snap.exists) {
            res.status(404).json({ error: 'Team not found' });
            return;
        }
        const team = snap.data();
        res.json({ ...team, createdAt: (0, firebaseAdmin_1.toIso)(team.createdAt) ?? null, updatedAt: (0, firebaseAdmin_1.toIso)(team.updatedAt) ?? null });
    }
    catch (e) {
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
        const batch = firebaseAdmin_1.firestore.batch();
        const joinsSnap = await firebaseAdmin_1.firestore.collection('playersToTeams').where('teamId', '==', id).get();
        joinsSnap.docs.forEach((docSnap) => batch.delete(docSnap.ref));
        const playersSnap = await firebaseAdmin_1.firestore.collection('players').where('teamId', '==', id).get();
        playersSnap.docs.forEach((docSnap) => batch.set(docSnap.ref, { teamId: null }, { merge: true }));
        batch.delete(firebaseAdmin_1.firestore.collection('teams').doc(String(id)));
        await batch.commit();
        res.json({ success: true });
    }
    catch (e) {
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
    }
    catch (e) {
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
        const id = await (0, firebaseAdmin_1.nextNumericId)('players');
        const player = {
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
        await firebaseAdmin_1.firestore.collection('players').doc(String(id)).set(player);
        const relationId = await (0, firebaseAdmin_1.nextNumericId)('playersToTeams');
        await firebaseAdmin_1.firestore.collection('playersToTeams').doc(String(relationId)).set({
            id: relationId,
            playerId: id,
            teamId,
        });
        res.json({ ...player, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
    }
    catch (e) {
        console.error(`[POST /api/teams/${req.params.id}/players] error:`, e);
        res.status(500).json({ error: 'Failed to create player' });
    }
});
exports.default = router;
