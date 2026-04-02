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
const db_1 = require("../db");
const schema_1 = require("../db/schema");
const drizzle_orm_1 = require("drizzle-orm");
const axios_1 = __importDefault(require("axios"));
const API_KEY = '9c3622c013ca2f69e8c373ecbf5af38e180f6d7d';
const REFERER = 'https://www.frbaschet.ro/';
const HEADERS = { Referer: REFERER };
function parseScore(rawScore) {
    const clean = rawScore.replace(/\s+/g, '');
    const parts = clean.split('-');
    return { home: parts[0] || '?', away: parts[1] || '?' };
}
function determineResult(homeTeamName, homeScore, awayScore) {
    const h = parseInt(homeScore, 10);
    const a = parseInt(awayScore, 10);
    if (isNaN(h) || isNaN(a))
        return 'N/A';
    return h > a ? 'W' : 'L';
}
function cleanText(s) {
    if (!s)
        return '';
    return s.replace(/<[^>]*>/g, '')
        .replace(/&nbsp;/g, ' ')
        .replace(/&nbsp/g, ' ')
        .replace(/\\r/g, '')
        .replace(/\\n/g, '')
        .replace(/\\t/g, '')
        .replace(/\\/g, '')
        .replace(/\r?\n|\r|\t/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}
function parseFRBDate(dateStr) {
    if (!dateStr || dateStr.trim() === '')
        return null;
    const cleanStr = cleanText(dateStr);
    if (cleanStr.match(/\d{4}-\d{2}-\d{2}/)) {
        const asIso = cleanStr.replace(' ', 'T') + ':00Z';
        const parsed = new Date(asIso);
        if (!isNaN(parsed.getTime()))
            return parsed;
    }
    const parts = cleanStr.split(' ');
    const dmy = parts[0].split('.');
    if (dmy.length === 3) {
        let time = parts.length > 1 && parts[parts.length - 1].includes(':') ? parts[parts.length - 1] : '12:00';
        const parsedDate = new Date(`${dmy[2]}-${dmy[1]}-${dmy[0]}T${time}:00Z`);
        if (!isNaN(parsedDate.getTime()))
            return parsedDate;
    }
    const fb = new Date(cleanStr);
    if (!isNaN(fb.getTime()))
        return fb;
    return null;
}
exports.eventsController = {
    getEvents(req, res) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const { start, end, type, coachId, teamId } = req.query;
                let query = db_1.db.select({
                    id: schema_1.events.id,
                    type: schema_1.events.type,
                    title: schema_1.events.title,
                    description: schema_1.events.description,
                    location: schema_1.events.location,
                    startTime: schema_1.events.startTime,
                    endTime: schema_1.events.endTime,
                    teamId: schema_1.events.teamId,
                    coachId: schema_1.events.coachId,
                    amount: schema_1.events.amount,
                    status: schema_1.events.status,
                    teamName: schema_1.teams.name,
                    coachName: schema_1.users.name
                })
                    .from(schema_1.events)
                    .leftJoin(schema_1.teams, (0, drizzle_orm_1.eq)(schema_1.events.teamId, schema_1.teams.id))
                    .leftJoin(schema_1.users, (0, drizzle_orm_1.eq)(schema_1.events.coachId, schema_1.users.id));
                const filters = [];
                if (start)
                    filters.push((0, drizzle_orm_1.gte)(schema_1.events.startTime, new Date(start)));
                if (end)
                    filters.push((0, drizzle_orm_1.lte)(schema_1.events.startTime, new Date(end)));
                if (type)
                    filters.push((0, drizzle_orm_1.eq)(schema_1.events.type, type));
                if (coachId)
                    filters.push((0, drizzle_orm_1.eq)(schema_1.events.coachId, parseInt(coachId)));
                if (teamId)
                    filters.push((0, drizzle_orm_1.eq)(schema_1.events.teamId, parseInt(teamId)));
                const results = yield (filters.length > 0 ? query.where((0, drizzle_orm_1.and)(...filters)) : query);
                res.json(results);
            }
            catch (error) {
                console.error('Get events error:', error);
                res.status(500).json({ error: 'Internal server error' });
            }
        });
    },
    getEventById(req, res) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const { id } = req.params;
                const result = yield db_1.db.select({
                    id: schema_1.events.id,
                    type: schema_1.events.type,
                    title: schema_1.events.title,
                    description: schema_1.events.description,
                    location: schema_1.events.location,
                    startTime: schema_1.events.startTime,
                    endTime: schema_1.events.endTime,
                    teamId: schema_1.events.teamId,
                    coachId: schema_1.events.coachId,
                    amount: schema_1.events.amount,
                    status: schema_1.events.status,
                    teamName: schema_1.teams.name,
                    coachName: schema_1.users.name,
                })
                    .from(schema_1.events)
                    .leftJoin(schema_1.teams, (0, drizzle_orm_1.eq)(schema_1.events.teamId, schema_1.teams.id))
                    .leftJoin(schema_1.users, (0, drizzle_orm_1.eq)(schema_1.events.coachId, schema_1.users.id))
                    .where((0, drizzle_orm_1.eq)(schema_1.events.id, parseInt(id)))
                    .limit(1);
                if (result.length === 0) {
                    return res.status(404).json({ error: 'Event not found' });
                }
                res.json(result[0]);
            }
            catch (error) {
                console.error('Get event by id error:', error);
                res.status(500).json({ error: 'Internal server error' });
            }
        });
    },
    createEvent(req, res) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const data = req.body;
                if (!data.title || !data.startTime || !data.endTime || !data.type) {
                    return res.status(400).json({ error: 'Missing required fields' });
                }
                const result = yield db_1.db.insert(schema_1.events).values(Object.assign(Object.assign({}, data), { startTime: new Date(data.startTime), endTime: new Date(data.endTime) })).returning();
                res.status(201).json(result[0]);
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
                const { id } = req.params;
                const data = req.body;
                const updateValues = Object.assign({}, data);
                if (data.startTime)
                    updateValues.startTime = new Date(data.startTime);
                if (data.endTime)
                    updateValues.endTime = new Date(data.endTime);
                const result = yield db_1.db.update(schema_1.events)
                    .set(updateValues)
                    .where((0, drizzle_orm_1.eq)(schema_1.events.id, parseInt(id)))
                    .returning();
                res.json(result[0]);
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
                const { id } = req.params;
                yield db_1.db.delete(schema_1.events).where((0, drizzle_orm_1.eq)(schema_1.events.id, parseInt(id)));
                res.status(204).send();
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
                const { id } = req.params;
                // 1. Get the event to find its teamId
                const eventResult = yield db_1.db.select().from(schema_1.events).where((0, drizzle_orm_1.eq)(schema_1.events.id, parseInt(id))).limit(1);
                if (eventResult.length === 0)
                    return res.status(404).json({ error: 'Event not found' });
                const event = eventResult[0];
                // 2. Fetch all players for that team (or all players if no team is assigned)
                let playersQuery = db_1.db.select({
                    id: schema_1.players.id,
                    firstName: schema_1.players.firstName,
                    lastName: schema_1.players.lastName,
                    number: schema_1.players.number,
                }).from(schema_1.players);
                if (event.teamId) {
                    playersQuery = playersQuery.where((0, drizzle_orm_1.eq)(schema_1.players.teamId, event.teamId));
                }
                const allTeamPlayers = yield playersQuery;
                // 3. Fetch existing attendance records for this event
                const existingAttendance = yield db_1.db.select()
                    .from(schema_1.attendance)
                    .where((0, drizzle_orm_1.eq)(schema_1.attendance.eventId, parseInt(id)));
                // 4. Map them together
                const results = allTeamPlayers.map(p => {
                    const record = existingAttendance.find(a => a.playerId === p.id);
                    return {
                        playerId: p.id,
                        firstName: p.firstName,
                        lastName: p.lastName,
                        number: p.number,
                        status: record ? record.status : null // Default to null (unmarked)
                    };
                });
                res.json(results);
            }
            catch (error) {
                console.error('Get event attendance error:', error);
                res.status(500).json({ error: 'Internal server error' });
            }
        });
    },
    updateEventAttendance(req, res) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const { id } = req.params;
                const { playerAttendances } = req.body;
                if (!Array.isArray(playerAttendances)) {
                    return res.status(400).json({ error: 'playerAttendances must be an array' });
                }
                for (const item of playerAttendances) {
                    const eventId = parseInt(id);
                    const playerId = item.playerId;
                    const existing = yield db_1.db.select()
                        .from(schema_1.attendance)
                        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.attendance.eventId, eventId), (0, drizzle_orm_1.eq)(schema_1.attendance.playerId, playerId)))
                        .limit(1);
                    if (existing.length > 0) {
                        yield db_1.db.update(schema_1.attendance)
                            .set({ status: item.status, date: new Date() })
                            .where((0, drizzle_orm_1.eq)(schema_1.attendance.id, existing[0].id));
                    }
                    else {
                        const eventResult = yield db_1.db.select().from(schema_1.events).where((0, drizzle_orm_1.eq)(schema_1.events.id, eventId)).limit(1);
                        const teamId = eventResult.length > 0 ? eventResult[0].teamId || 0 : 0;
                        yield db_1.db.insert(schema_1.attendance).values({
                            playerId,
                            eventId,
                            teamId,
                            status: item.status,
                            date: new Date()
                        });
                    }
                }
                res.json({ success: true });
            }
            catch (error) {
                console.error('Update event attendance error:', error);
                res.status(500).json({ error: 'Internal server error' });
            }
        });
    },
    syncFRBMatches(req, res) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const allTeams = yield db_1.db.select().from(schema_1.teams);
                let syncedCount = 0;
                for (const team of allTeams) {
                    if (!team.frbTeamId || !team.frbSeasonId || !team.frbLeagueId)
                        continue;
                    // Month pagination bypassing strategy
                    const monthPromises = [];
                    for (let m = 1; m <= 12; m++) {
                        const url = `https://widgets.baskethotel.com/widget-service/show?&api=${API_KEY}&lang=ro&request[0][widget]=200&request[0][part]=schedule_and_results&request[0][param][team_id]=${team.frbTeamId}&request[0][param][league_id]=${team.frbLeagueId}&request[0][param][season_id]=${team.frbSeasonId}&request[0][param][month]=${m}`;
                        monthPromises.push(axios_1.default.get(url, { headers: HEADERS }).catch(() => null));
                    }
                    const responses = yield Promise.all(monthPromises);
                    for (const response of responses) {
                        if (!response || !response.data)
                            continue;
                        const htmlMatch = response.data.match(/MBT\.API\.update\('.*?',\s*'([\s\S]*?)'\);/);
                        if (!htmlMatch)
                            continue;
                        let html = htmlMatch[1]
                            .replace(/\\n/g, '')
                            .replace(/\\"/g, '"')
                            .replace(/\\\//g, '/');
                        const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
                        let rowMatch;
                        while ((rowMatch = rowRegex.exec(html)) !== null) {
                            const rowHtml = rowMatch[1];
                            const cells = [];
                            let cellMatch;
                            const cellReg = /<td[^>]*>([\s\S]*?)<\/td>/gi;
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
                                const existingEvents = yield db_1.db.select()
                                    .from(schema_1.events)
                                    .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.events.teamId, team.id), (0, drizzle_orm_1.eq)(schema_1.events.title, title)));
                                const exists = existingEvents.some(e => {
                                    const d = new Date(e.startTime);
                                    return d.getFullYear() === startDateOnly.getFullYear() &&
                                        d.getMonth() === startDateOnly.getMonth() &&
                                        d.getDate() === startDateOnly.getDate();
                                });
                                if (!exists) {
                                    yield db_1.db.insert(schema_1.events).values({
                                        type: 'match',
                                        title: title,
                                        description: 'Synced from FRB',
                                        location: 'Auto-Synced Location',
                                        startTime: startTime,
                                        endTime: endTime,
                                        teamId: team.id,
                                        status: 'scheduled'
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
