"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.eventsController = void 0;
const axios_1 = __importDefault(require("axios"));
const firebaseAdmin_1 = require("../lib/firebaseAdmin");
const db_1 = require("../db");
const schema_1 = require("../db/schema");
const drizzle_orm_1 = require("drizzle-orm");
const API_KEY = '9c3622c013ca2f69e8c373ecbf5af38e180f6d7d';
const REFERER = 'https://www.frbaschet.ro/';
const HEADERS = { Referer: REFERER };
function parseRequiredDate(value, fieldName) {
    const date = value ? new Date(String(value)) : null;
    if (!date || Number.isNaN(date.getTime())) {
        throw new Error(`${fieldName} is invalid.`);
    }
    return date;
}
function parseFRBDate(dateStr) {
    const match = /(\d{2})\.(\d{2})\.(\d{4})(?:\s+(\d{2}):(\d{2}))?/.exec(dateStr);
    if (!match) {
        return null;
    }
    const [, d, m, y, hh, mm] = match;
    return new Date(Number(y), Number(m) - 1, Number(d), Number(hh ?? '0'), Number(mm ?? '0'));
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
async function enrichEvent(event) {
    const [teamRows, coachRows] = await Promise.all([
        event.teamId != null ? db_1.db.select({ name: schema_1.teams.name }).from(schema_1.teams).where((0, drizzle_orm_1.eq)(schema_1.teams.id, event.teamId)).limit(1) : Promise.resolve([]),
        event.coachId != null ? db_1.db.select({ name: schema_1.users.name }).from(schema_1.users).where((0, drizzle_orm_1.eq)(schema_1.users.id, event.coachId)).limit(1) : Promise.resolve([]),
    ]);
    const teamName = teamRows[0]?.name ?? null;
    const coachName = coachRows[0]?.name ?? null;
    return {
        ...event,
        startTime: (0, firebaseAdmin_1.toIso)(event.startTime) ?? new Date().toISOString(),
        endTime: (0, firebaseAdmin_1.toIso)(event.endTime) ?? new Date().toISOString(),
        createdAt: (0, firebaseAdmin_1.toIso)(event.createdAt) ?? null,
        teamName,
        coachName,
    };
}
function getRequestClubId(req) {
    return req.user?.clubId == null ? null : Number(req.user.clubId);
}
function isSuperadmin(req) {
    return req.user?.role === 'superadmin';
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
    const role = req.user?.role;
    if (role !== 'admin' && role !== 'coach' && role !== 'manager') {
        return { status: 403, error: 'You do not have permission to modify events for this team.' };
    }
    return { status: 200, team };
}
exports.eventsController = {
    async getEvents(req, res) {
        try {
            const { start, end, type, coachId, teamId } = req.query;
            const eventRows = await db_1.db.select().from(schema_1.events);
            let allowedTeamIds = null;
            if (!isSuperadmin(req)) {
                const clubId = getRequestClubId(req);
                if (clubId == null) {
                    return res.json([]);
                }
                const clubTeams = await db_1.db.select({ id: schema_1.teams.id }).from(schema_1.teams).where((0, drizzle_orm_1.eq)(schema_1.teams.clubId, clubId));
                allowedTeamIds = clubTeams.map(t => t.id);
            }
            const filteredEvents = eventRows
                .map((event) => event)
                .filter((event) => {
                if (allowedTeamIds !== null && event.teamId != null && !allowedTeamIds.includes(event.teamId)) {
                    return false;
                }
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
            const enriched = await Promise.all(filteredEvents.map(enrichEvent));
            res.json(enriched);
        }
        catch (error) {
            console.error('[GET /api/events] error:', error);
            res.status(500).json({ error: 'Failed to fetch events' });
        }
    },
    async getEventById(req, res) {
        try {
            const eventId = Number(req.params.id);
            const rows = await db_1.db.select().from(schema_1.events).where((0, drizzle_orm_1.eq)(schema_1.events.id, eventId)).limit(1);
            const event = rows[0];
            if (!event) {
                return res.status(404).json({ error: 'Event not found' });
            }
            if (!isSuperadmin(req)) {
                const clubId = getRequestClubId(req);
                if (event.teamId != null) {
                    const teamRows = await db_1.db.select().from(schema_1.teams).where((0, drizzle_orm_1.eq)(schema_1.teams.id, event.teamId)).limit(1);
                    if (teamRows[0] && teamRows[0].clubId !== clubId) {
                        return res.status(403).json({ error: 'Access denied' });
                    }
                }
            }
            res.json(await enrichEvent(event));
        }
        catch (error) {
            console.error('Get event by id error:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    },
    async createEvent(req, res) {
        try {
            const startTime = parseRequiredDate(req.body.startTime, 'startTime');
            const endTime = parseRequiredDate(req.body.endTime, 'endTime');
            const teamId = req.body.teamId != null ? Number(req.body.teamId) : null;
            if (!req.body.title || !String(req.body.title).trim()) {
                return res.status(400).json({ error: 'Event title is required.' });
            }
            if (teamId == null || Number.isNaN(teamId)) {
                return res.status(400).json({ error: 'A valid team is required.' });
            }
            const access = await ensureTeamAccess(req, teamId);
            if (access.status !== 200) {
                return res.status(access.status).json({ error: access.error });
            }
            const [event] = await db_1.db.insert(schema_1.events).values({
                type: req.body.type || 'training',
                title: String(req.body.title).trim(),
                description: req.body.description ?? null,
                location: req.body.location ?? null,
                startTime: startTime.toISOString(),
                endTime: endTime.toISOString(),
                teamId,
                coachId: req.body.coachId != null ? Number(req.body.coachId) : null,
                amount: req.body.amount != null ? Number(req.body.amount) : null,
                status: req.body.status || 'scheduled',
                createdAt: new Date().toISOString(),
            }).returning();
            res.json(await enrichEvent(event));
        }
        catch (error) {
            console.error('Create event error:', error);
            const message = error instanceof Error ? error.message : 'Internal server error';
            const isValidationError = /^(startTime|endTime) is invalid\.$/.test(message);
            res.status(isValidationError ? 400 : 500).json({ error: message });
        }
    },
    async updateEvent(req, res) {
        try {
            const eventId = Number(req.params.id);
            const existingRows = await db_1.db.select().from(schema_1.events).where((0, drizzle_orm_1.eq)(schema_1.events.id, eventId)).limit(1);
            const existingEvent = existingRows[0];
            if (!existingEvent) {
                return res.status(404).json({ error: 'Event not found' });
            }
            if (existingEvent.teamId != null) {
                const access = await ensureTeamAccess(req, existingEvent.teamId);
                if (access.status !== 200) {
                    return res.status(access.status).json({ error: access.error });
                }
            }
            const updates = {
                ...(req.body.type !== undefined ? { type: req.body.type } : {}),
                ...(req.body.title !== undefined ? { title: req.body.title } : {}),
                ...(req.body.description !== undefined ? { description: req.body.description } : {}),
                ...(req.body.location !== undefined ? { location: req.body.location } : {}),
                ...(req.body.startTime !== undefined ? { startTime: new Date(req.body.startTime).toISOString() } : {}),
                ...(req.body.endTime !== undefined ? { endTime: new Date(req.body.endTime).toISOString() } : {}),
                ...(req.body.teamId !== undefined ? { teamId: req.body.teamId == null ? null : Number(req.body.teamId) } : {}),
                ...(req.body.coachId !== undefined ? { coachId: req.body.coachId == null ? null : Number(req.body.coachId) } : {}),
                ...(req.body.amount !== undefined ? { amount: req.body.amount == null ? null : Number(req.body.amount) } : {}),
                ...(req.body.status !== undefined ? { status: req.body.status } : {}),
            };
            const [updated] = await db_1.db.update(schema_1.events).set(updates).where((0, drizzle_orm_1.eq)(schema_1.events.id, eventId)).returning();
            res.json(await enrichEvent(updated));
        }
        catch (error) {
            console.error('Update event error:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    },
    async deleteEvent(req, res) {
        try {
            const eventId = Number(req.params.id);
            const existingRows = await db_1.db.select().from(schema_1.events).where((0, drizzle_orm_1.eq)(schema_1.events.id, eventId)).limit(1);
            const existingEvent = existingRows[0];
            if (!existingEvent) {
                return res.status(404).json({ error: 'Event not found' });
            }
            if (existingEvent.teamId != null) {
                const access = await ensureTeamAccess(req, existingEvent.teamId);
                if (access.status !== 200) {
                    return res.status(access.status).json({ error: access.error });
                }
            }
            await db_1.db.delete(schema_1.attendance).where((0, drizzle_orm_1.eq)(schema_1.attendance.eventId, eventId));
            await db_1.db.delete(schema_1.events).where((0, drizzle_orm_1.eq)(schema_1.events.id, eventId));
            res.json({ success: true });
        }
        catch (error) {
            console.error('Delete event error:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    },
    async getEventAttendance(req, res) {
        try {
            const eventId = Number(req.params.id);
            const existingRows = await db_1.db.select().from(schema_1.events).where((0, drizzle_orm_1.eq)(schema_1.events.id, eventId)).limit(1);
            const existingEvent = existingRows[0];
            if (!existingEvent) {
                return res.status(404).json({ error: 'Event not found' });
            }
            if (!isSuperadmin(req)) {
                const clubId = getRequestClubId(req);
                if (existingEvent.teamId != null) {
                    const teamRows = await db_1.db.select().from(schema_1.teams).where((0, drizzle_orm_1.eq)(schema_1.teams.id, existingEvent.teamId)).limit(1);
                    if (teamRows[0] && teamRows[0].clubId !== clubId) {
                        return res.status(403).json({ error: 'Access denied' });
                    }
                }
            }
            const attendanceRows = await db_1.db.select().from(schema_1.attendance).where((0, drizzle_orm_1.eq)(schema_1.attendance.eventId, eventId));
            const playerIds = attendanceRows.map((row) => row.playerId);
            const playersById = new Map();
            const playerRows = playerIds.length ? await db_1.db.select().from(schema_1.players) : [];
            playerRows.forEach((player) => {
                if (playerIds.includes(player.id)) {
                    playersById.set(player.id, player);
                }
            });
            res.json(attendanceRows.map((row) => {
                const player = playersById.get(row.playerId);
                return {
                    playerId: row.playerId,
                    firstName: player?.firstName ?? '',
                    lastName: player?.lastName ?? '',
                    number: player?.number ?? null,
                    status: row.status,
                };
            }));
        }
        catch (error) {
            console.error('Get event attendance error:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    },
    async updateEventAttendance(req, res) {
        try {
            const eventId = Number(req.params.id);
            const playerAttendances = Array.isArray(req.body?.playerAttendances) ? req.body.playerAttendances : [];
            const eventRows = await db_1.db.select().from(schema_1.events).where((0, drizzle_orm_1.eq)(schema_1.events.id, eventId)).limit(1);
            const event = eventRows[0];
            if (!event) {
                return res.status(404).json({ error: 'Event not found' });
            }
            if (event.teamId != null) {
                const access = await ensureTeamAccess(req, event.teamId);
                if (access.status !== 200) {
                    return res.status(access.status).json({ error: access.error });
                }
            }
            for (const item of playerAttendances) {
                const playerId = Number(item.playerId);
                const status = String(item.status);
                const existingRows = await db_1.db.select().from(schema_1.attendance).where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.attendance.eventId, eventId), (0, drizzle_orm_1.eq)(schema_1.attendance.playerId, playerId))).limit(1);
                const existing = existingRows[0];
                if (existing?.id != null) {
                    await db_1.db.update(schema_1.attendance).set({ status, date: new Date().toISOString() }).where((0, drizzle_orm_1.eq)(schema_1.attendance.id, existing.id));
                }
                else {
                    await db_1.db.insert(schema_1.attendance).values({
                        playerId,
                        eventId,
                        teamId: event.teamId ?? 0,
                        status,
                        date: new Date().toISOString(),
                    });
                }
            }
            res.json({ success: true });
        }
        catch (error) {
            console.error('Update event attendance error:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    },
    async syncFRBMatches(req, res) {
        try {
            if (!isSuperadmin(req)) {
                return res.status(403).json({ error: 'Only superadmin can sync FRB matches manually here.' });
            }
            const allTeams = await db_1.db.select().from(schema_1.teams);
            const existingEvents = (await db_1.db.select().from(schema_1.events)).map((event) => event);
            let syncedCount = 0;
            for (const team of allTeams) {
                if (!team.frbTeamId || !team.frbSeasonId || !team.frbLeagueId)
                    continue;
                const responses = await Promise.all(Array.from({ length: 12 }, (_, idx) => idx + 1).map((month) => {
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
                            const score = parseScore(cells[2] || '');
                            const awayTeam = cells[3] || '';
                            if (!homeTeam && !awayTeam)
                                continue;
                            const title = `${homeTeam} vs ${awayTeam}`;
                            const startTime = parseFRBDate(dateStr);
                            if (!startTime)
                                continue;
                            const endTime = new Date(startTime.getTime() + 2 * 60 * 60 * 1000);
                            const startDateOnly = new Date(startTime.getFullYear(), startTime.getMonth(), startTime.getDate());
                            const exists = existingEvents.some((event) => {
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
                                const status = determineStatus(score.home, score.away);
                                const description = status === 'finished'
                                    ? `Synced from FRB. Score: ${score.home} - ${score.away}`
                                    : 'Synced from FRB';
                                const [created] = await db_1.db.insert(schema_1.events).values({
                                    type: 'match',
                                    title,
                                    description,
                                    location: 'Auto-Synced Location',
                                    startTime: startTime.toISOString(),
                                    endTime: endTime.toISOString(),
                                    teamId: team.id,
                                    status,
                                    createdAt: new Date().toISOString(),
                                }).returning();
                                existingEvents.push(created);
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
    }
};
