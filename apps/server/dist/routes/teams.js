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
const firebaseAdmin_1 = require("../lib/firebaseAdmin");
const crypto_1 = __importDefault(require("crypto"));
const router = (0, express_1.Router)();
function getTeamPlayersById(teamId) {
    return __awaiter(this, void 0, void 0, function* () {
        const playersSnap = yield firebaseAdmin_1.firestore.collection('players').where('teamId', '==', teamId).get();
        const playerDocs = playersSnap.docs.map((docSnap) => docSnap.data());
        const joinSnap = yield firebaseAdmin_1.firestore.collection('playersToTeams').where('teamId', '==', teamId).get();
        const joinPlayerIds = joinSnap.docs.map((docSnap) => Number(docSnap.data().playerId));
        if (joinPlayerIds.length > 0) {
            const extraPlayersSnap = yield firebaseAdmin_1.firestore.collection('players').where('id', 'in', joinPlayerIds.slice(0, 10)).get();
            extraPlayersSnap.docs.forEach((docSnap) => {
                const player = docSnap.data();
                if (!playerDocs.some((existing) => existing.id === player.id)) {
                    playerDocs.push(player);
                }
            });
        }
        return Array.from(new Map(playerDocs.map((player) => [player.id, player])).values()).map((player) => {
            var _a, _b, _c, _d, _e, _f, _g, _h, _j;
            return ({
                id: player.id,
                firstName: player.firstName,
                lastName: player.lastName,
                name: (_a = player.name) !== null && _a !== void 0 ? _a : `${player.firstName} ${player.lastName}`.trim(),
                email: (_b = player.email) !== null && _b !== void 0 ? _b : null,
                number: (_c = player.number) !== null && _c !== void 0 ? _c : null,
                status: (_d = player.status) !== null && _d !== void 0 ? _d : 'active',
                avatarUrl: (_e = player.avatarUrl) !== null && _e !== void 0 ? _e : null,
                teamId: (_f = player.teamId) !== null && _f !== void 0 ? _f : null,
                createdAt: (_g = (0, firebaseAdmin_1.toIso)(player.createdAt)) !== null && _g !== void 0 ? _g : null,
                medicalCheckExpiry: (_h = (0, firebaseAdmin_1.toIso)(player.medicalCheckExpiry)) !== null && _h !== void 0 ? _h : null,
                birthYear: (_j = player.birthYear) !== null && _j !== void 0 ? _j : null,
            });
        });
    });
}
// GET /api/teams
router.get('/', (_req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const snap = yield firebaseAdmin_1.firestore.collection('teams').orderBy('createdAt', 'asc').get();
        const allTeams = snap.docs.map((docSnap) => docSnap.data()).map((team) => {
            var _a;
            return (Object.assign(Object.assign({}, team), { createdAt: (_a = (0, firebaseAdmin_1.toIso)(team.createdAt)) !== null && _a !== void 0 ? _a : new Date().toISOString() }));
        });
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
        const inviteCode = crypto_1.default.randomBytes(3).toString('hex').toUpperCase();
        const id = yield (0, firebaseAdmin_1.nextNumericId)('teams');
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
        yield firebaseAdmin_1.firestore.collection('teams').doc(String(id)).set(team);
        res.json(Object.assign(Object.assign({}, team), { createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }));
    }
    catch (e) {
        console.error('[POST /api/teams] error:', e);
        res.status(500).json({ error: 'Failed to create team' });
    }
}));
// GET /api/teams/:id
router.get('/:id', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    try {
        const id = parseInt(req.params.id, 10);
        if (isNaN(id)) {
            res.status(400).json({ error: 'Invalid ID' });
            return;
        }
        const snap = yield firebaseAdmin_1.firestore.collection('teams').doc(String(id)).get();
        if (!snap.exists) {
            res.status(404).json({ error: 'Team not found' });
            return;
        }
        const team = snap.data();
        res.json(Object.assign(Object.assign({}, team), { createdAt: (_a = (0, firebaseAdmin_1.toIso)(team.createdAt)) !== null && _a !== void 0 ? _a : null, updatedAt: (_b = (0, firebaseAdmin_1.toIso)(team.updatedAt)) !== null && _b !== void 0 ? _b : null }));
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
        const batch = firebaseAdmin_1.firestore.batch();
        const joinsSnap = yield firebaseAdmin_1.firestore.collection('playersToTeams').where('teamId', '==', id).get();
        joinsSnap.docs.forEach((docSnap) => batch.delete(docSnap.ref));
        const playersSnap = yield firebaseAdmin_1.firestore.collection('players').where('teamId', '==', id).get();
        playersSnap.docs.forEach((docSnap) => batch.set(docSnap.ref, { teamId: null }, { merge: true }));
        batch.delete(firebaseAdmin_1.firestore.collection('teams').doc(String(id)));
        yield batch.commit();
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
        const teamPlayers = yield getTeamPlayersById(id);
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
        const id = yield (0, firebaseAdmin_1.nextNumericId)('players');
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
        yield firebaseAdmin_1.firestore.collection('players').doc(String(id)).set(player);
        const relationId = yield (0, firebaseAdmin_1.nextNumericId)('playersToTeams');
        yield firebaseAdmin_1.firestore.collection('playersToTeams').doc(String(relationId)).set({
            id: relationId,
            playerId: id,
            teamId,
        });
        res.json(Object.assign(Object.assign({}, player), { createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }));
    }
    catch (e) {
        console.error(`[POST /api/teams/${req.params.id}/players] error:`, e);
        res.status(500).json({ error: 'Failed to create player' });
    }
}));
exports.default = router;
