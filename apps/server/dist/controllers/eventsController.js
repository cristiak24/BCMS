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
exports.eventsController = void 0;
const axios_1 = __importDefault(require("axios"));
const firebaseAdmin_1 = require("../lib/firebaseAdmin");
const API_KEY = '9c3622c013ca2f69e8c373ecbf5af38e180f6d7d';
const REFERER = 'https://www.frbaschet.ro/';
const HEADERS = { Referer: REFERER };
function parseFRBDate(dateStr) {
    const match = /(\d{2})\.(\d{2})\.(\d{4})(?:\s+(\d{2}):(\d{2}))?/.exec(dateStr);
    if (!match) {
        return null;
    }
    const [, d, m, y, hh, mm] = match;
    return new Date(Number(y), Number(m) - 1, Number(d), Number(hh !== null && hh !== void 0 ? hh : '0'), Number(mm !== null && mm !== void 0 ? mm : '0'));
}
function cleanText(text) {
    return text.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
}
function parseScore(rawScore) {
    const clean = (rawScore || '').replace(/\s+/g, '').trim();
    if (!clean || clean === '?' || clean === '-' || !/\d/.test(clean)) {
        return { home: '', away: '' };
    }
    const parts = clean.split('-');
    if (parts.length !== 2)
        return { home: '', away: '' };
    const h = parts[0].trim();
    const a = parts[1].trim();
    if (!/^\d+$/.test(h) || !/^\d+$/.test(a)) {
        return { home: '', away: '' };
    }
    return { home: h, away: a };
}
function determineStatus(homeScore, awayScore) {
    return !homeScore || !awayScore ? 'scheduled' : 'finished';
}
function enrichEvent(event) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b, _c, _d, _e, _f;
        const [teamSnap, coachSnap] = yield Promise.all([
            event.teamId != null ? firebaseAdmin_1.firestore.collection('teams').doc(String(event.teamId)).get() : Promise.resolve(null),
            event.coachId != null ? firebaseAdmin_1.firestore.collection('users').where('id', '==', event.coachId).limit(1).get() : Promise.resolve(null),
        ]);
        const teamName = (teamSnap === null || teamSnap === void 0 ? void 0 : teamSnap.exists) ? teamSnap.data().name : null;
        const coachName = coachSnap && 'docs' in coachSnap ? ((_c = (_b = (_a = coachSnap.docs[0]) === null || _a === void 0 ? void 0 : _a.data()) === null || _b === void 0 ? void 0 : _b.name) !== null && _c !== void 0 ? _c : null) : null;
        return Object.assign(Object.assign({}, event), { startTime: (_d = (0, firebaseAdmin_1.toIso)(event.startTime)) !== null && _d !== void 0 ? _d : new Date().toISOString(), endTime: (_e = (0, firebaseAdmin_1.toIso)(event.endTime)) !== null && _e !== void 0 ? _e : new Date().toISOString(), createdAt: (_f = (0, firebaseAdmin_1.toIso)(event.createdAt)) !== null && _f !== void 0 ? _f : null, teamName,
            coachName });
    });
}
exports.eventsController = {
    getEvents(req, res) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const { start, end, type, coachId, teamId } = req.query;
                const snap = yield firebaseAdmin_1.firestore.collection('events').get();
                const events = snap.docs
                    .map((docSnap) => docSnap.data())
                    .filter((event) => {
                    if (type && event.type !== type) {
                        return false;
                    }
                    if (coachId && event.coachId !== Number(coachId)) {
                        return false;
                    }
                    if (teamId && event.teamId !== Number(teamId)) {
                        return false;
                    }
                    const startDate = start ? new Date(start) : null;
                    const endDate = end ? new Date(end) : null;
                    const eventDate = (0, firebaseAdmin_1.toDate)(event.startTime);
                    if (!eventDate)
                        return true;
                    if (startDate && eventDate < startDate)
                        return false;
                    if (endDate && eventDate > endDate)
                        return false;
                    return true;
                });
                const enriched = yield Promise.all(events.map(enrichEvent));
                res.json(enriched);
            }
            catch (error) {
                console.error('[GET /api/events] error:', error);
                res.status(500).json({ error: 'Failed to fetch events' });
            }
        });
    },
    getEventById(req, res) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const eventId = Number(req.params.id);
                const snap = yield firebaseAdmin_1.firestore.collection('events').doc(String(eventId)).get();
                if (!snap.exists) {
                    return res.status(404).json({ error: 'Event not found' });
                }
                res.json(yield enrichEvent(snap.data()));
            }
            catch (error) {
                console.error('Get event by id error:', error);
                res.status(500).json({ error: 'Internal server error' });
            }
        });
    },
    createEvent(req, res) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, _b;
            try {
                const id = yield (0, firebaseAdmin_1.nextNumericId)('events');
                const event = {
                    id,
                    type: req.body.type || 'training',
                    title: req.body.title || 'Untitled Event',
                    description: (_a = req.body.description) !== null && _a !== void 0 ? _a : null,
                    location: (_b = req.body.location) !== null && _b !== void 0 ? _b : null,
                    startTime: req.body.startTime ? new Date(req.body.startTime) : new Date(),
                    endTime: req.body.endTime ? new Date(req.body.endTime) : new Date(Date.now() + 60 * 60 * 1000),
                    teamId: req.body.teamId != null ? Number(req.body.teamId) : null,
                    coachId: req.body.coachId != null ? Number(req.body.coachId) : null,
                    amount: req.body.amount != null ? Number(req.body.amount) : null,
                    status: req.body.status || 'scheduled',
                    createdAt: new Date(),
                };
                yield firebaseAdmin_1.firestore.collection('events').doc(String(id)).set(event);
                res.json(yield enrichEvent(event));
            }
            catch (error) {
                console.error('Create event error:', error);
                res.status(500).json({ error: 'Internal server error' });
            }
        });
    },
    updateEvent(req, res) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const eventId = Number(req.params.id);
                const snap = yield firebaseAdmin_1.firestore.collection('events').doc(String(eventId)).get();
                if (!snap.exists) {
                    return res.status(404).json({ error: 'Event not found' });
                }
                const updates = Object.assign(Object.assign(Object.assign(Object.assign(Object.assign(Object.assign(Object.assign(Object.assign(Object.assign(Object.assign({}, (req.body.type !== undefined ? { type: req.body.type } : {})), (req.body.title !== undefined ? { title: req.body.title } : {})), (req.body.description !== undefined ? { description: req.body.description } : {})), (req.body.location !== undefined ? { location: req.body.location } : {})), (req.body.startTime !== undefined ? { startTime: new Date(req.body.startTime) } : {})), (req.body.endTime !== undefined ? { endTime: new Date(req.body.endTime) } : {})), (req.body.teamId !== undefined ? { teamId: req.body.teamId == null ? null : Number(req.body.teamId) } : {})), (req.body.coachId !== undefined ? { coachId: req.body.coachId == null ? null : Number(req.body.coachId) } : {})), (req.body.amount !== undefined ? { amount: req.body.amount == null ? null : Number(req.body.amount) } : {})), (req.body.status !== undefined ? { status: req.body.status } : {}));
                yield snap.ref.set(updates, { merge: true });
                const updated = yield snap.ref.get();
                res.json(yield enrichEvent(updated.data()));
            }
            catch (error) {
                console.error('Update event error:', error);
                res.status(500).json({ error: 'Internal server error' });
            }
        });
    },
    deleteEvent(req, res) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const eventId = Number(req.params.id);
                const batch = firebaseAdmin_1.firestore.batch();
                const attendanceSnap = yield firebaseAdmin_1.firestore.collection('attendance').where('eventId', '==', eventId).get();
                attendanceSnap.docs.forEach((docSnap) => batch.delete(docSnap.ref));
                batch.delete(firebaseAdmin_1.firestore.collection('events').doc(String(eventId)));
                yield batch.commit();
                res.json({ success: true });
            }
            catch (error) {
                console.error('Delete event error:', error);
                res.status(500).json({ error: 'Internal server error' });
            }
        });
    },
    getEventAttendance(req, res) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const eventId = Number(req.params.id);
                const attendanceSnap = yield firebaseAdmin_1.firestore.collection('attendance').where('eventId', '==', eventId).get();
                const attendanceRows = attendanceSnap.docs.map((docSnap) => docSnap.data());
                const playerIds = attendanceRows.map((row) => row.playerId);
                const playersSnap = yield firebaseAdmin_1.firestore.collection('players').get();
                const playersById = new Map();
                playersSnap.docs.forEach((docSnap) => {
                    const player = docSnap.data();
                    if (playerIds.includes(player.id)) {
                        playersById.set(player.id, player);
                    }
                });
                res.json(attendanceRows.map((row) => {
                    var _a, _b, _c;
                    const player = playersById.get(row.playerId);
                    return {
                        playerId: row.playerId,
                        firstName: (_a = player === null || player === void 0 ? void 0 : player.firstName) !== null && _a !== void 0 ? _a : '',
                        lastName: (_b = player === null || player === void 0 ? void 0 : player.lastName) !== null && _b !== void 0 ? _b : '',
                        number: (_c = player === null || player === void 0 ? void 0 : player.number) !== null && _c !== void 0 ? _c : null,
                        status: row.status,
                    };
                }));
            }
            catch (error) {
                console.error('Get event attendance error:', error);
                res.status(500).json({ error: 'Internal server error' });
            }
        });
    },
    updateEventAttendance(req, res) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, _b;
            try {
                const eventId = Number(req.params.id);
                const playerAttendances = Array.isArray((_a = req.body) === null || _a === void 0 ? void 0 : _a.playerAttendances) ? req.body.playerAttendances : [];
                const eventSnap = yield firebaseAdmin_1.firestore.collection('events').doc(String(eventId)).get();
                if (!eventSnap.exists) {
                    return res.status(404).json({ error: 'Event not found' });
                }
                const event = eventSnap.data();
                const batch = firebaseAdmin_1.firestore.batch();
                for (const item of playerAttendances) {
                    const playerId = Number(item.playerId);
                    const status = String(item.status);
                    const existingSnap = yield firebaseAdmin_1.firestore.collection('attendance')
                        .where('eventId', '==', eventId)
                        .where('playerId', '==', playerId)
                        .limit(1)
                        .get();
                    const existing = existingSnap.docs[0];
                    if (existing) {
                        batch.set(existing.ref, { status, date: firebaseAdmin_1.admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
                    }
                    else {
                        const id = yield (0, firebaseAdmin_1.nextNumericId)('attendance');
                        batch.set(firebaseAdmin_1.firestore.collection('attendance').doc(String(id)), {
                            id,
                            playerId,
                            eventId,
                            teamId: (_b = event.teamId) !== null && _b !== void 0 ? _b : 0,
                            status,
                            date: firebaseAdmin_1.admin.firestore.FieldValue.serverTimestamp(),
                        });
                    }
                }
                yield batch.commit();
                res.json({ success: true });
            }
            catch (error) {
                console.error('Update event attendance error:', error);
                res.status(500).json({ error: 'Internal server error' });
            }
        });
    },
    syncFRBMatches(_req, res) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const teamsSnap = yield firebaseAdmin_1.firestore.collection('teams').get();
                const allTeams = teamsSnap.docs.map((docSnap) => docSnap.data());
                let syncedCount = 0;
                for (const team of allTeams) {
                    if (!team.frbTeamId || !team.frbSeasonId || !team.frbLeagueId)
                        continue;
                    const responses = yield Promise.all(Array.from({ length: 12 }, (_, idx) => idx + 1).map((month) => {
                        const url = `https://widgets.baskethotel.com/widget-service/show?&api=${API_KEY}&lang=ro&request[0][widget]=200&request[0][part]=schedule_and_results&request[0][param][team_id]=${team.frbTeamId}&request[0][param][league_id]=${team.frbLeagueId}&request[0][param][season_id]=${team.frbSeasonId}&request[0][param][month]=${month}`;
                        return axios_1.default.get(url, { headers: HEADERS }).catch(() => null);
                    }));
                    for (const response of responses) {
                        if (!response || !response.data)
                            continue;
                        const htmlMatch = response.data.match(/MBT\.API\.update\('.*?',\s*'([\s\S]*?)'\);/);
                        if (!htmlMatch)
                            continue;
                        const html = htmlMatch[1].replace(/\\n/g, '').replace(/\\"/g, '"').replace(/\\\//g, '/');
                        const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
                        let rowMatch;
                        while ((rowMatch = rowRegex.exec(html)) !== null) {
                            const rowHtml = rowMatch[1];
                            const cells = [];
                            const cellReg = /<td[^>]*>([\s\S]*?)<\/td>/gi;
                            let cellMatch;
                            while ((cellMatch = cellReg.exec(rowHtml)) !== null) {
                                cells.push(cleanText(cellMatch[1]));
                            }
                            if (cells.length >= 4 && cells[0] !== '') {
                                const dateStr = cells[0];
                                const homeTeam = cells[1] || '';
                                const awayTeam = cells[3] || '';
                                if (!homeTeam && !awayTeam)
                                    continue;
                                const title = `${homeTeam} vs ${awayTeam}`;
                                const startTime = parseFRBDate(dateStr);
                                if (!startTime)
                                    continue;
                                const endTime = new Date(startTime.getTime() + 2 * 60 * 60 * 1000);
                                const startDateOnly = new Date(startTime.getFullYear(), startTime.getMonth(), startTime.getDate());
                                const allEventsSnap = yield firebaseAdmin_1.firestore.collection('events').get();
                                const exists = allEventsSnap.docs.some((docSnap) => {
                                    const event = docSnap.data();
                                    if (event.teamId !== team.id || event.title !== title) {
                                        return false;
                                    }
                                    const d = (0, firebaseAdmin_1.toDate)(event.startTime);
                                    return d
                                        && d.getFullYear() === startDateOnly.getFullYear()
                                        && d.getMonth() === startDateOnly.getMonth()
                                        && d.getDate() === startDateOnly.getDate();
                                });
                                if (!exists) {
                                    const id = yield (0, firebaseAdmin_1.nextNumericId)('events');
                                    yield firebaseAdmin_1.firestore.collection('events').doc(String(id)).set({
                                        id,
                                        type: 'match',
                                        title,
                                        description: 'Synced from FRB',
                                        location: 'Auto-Synced Location',
                                        startTime,
                                        endTime,
                                        teamId: team.id,
                                        status: 'scheduled',
                                        createdAt: new Date(),
                                    });
                                    syncedCount++;
                                }
                            }
                        }
                    }
                }
                res.json({ success: true, syncedCount });
            }
            catch (error) {
                console.error('Sync FRB matches error:', error);
                res.status(500).json({ error: 'Internal server error while syncing matches' });
            }
        });
    }
};
