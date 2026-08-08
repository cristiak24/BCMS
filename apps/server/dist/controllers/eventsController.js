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
const db_1 = require("../db");
const schema_1 = require("../db/schema");
const drizzle_orm_1 = require("drizzle-orm");
const eventQuery_1 = require("../lib/eventQuery");
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
function toEventPayload(event, teamName, coachName) {
    var _a, _b, _c;
    return Object.assign(Object.assign({}, event), { startTime: (_a = (0, firebaseAdmin_1.toIso)(event.startTime)) !== null && _a !== void 0 ? _a : new Date().toISOString(), endTime: (_b = (0, firebaseAdmin_1.toIso)(event.endTime)) !== null && _b !== void 0 ? _b : new Date().toISOString(), createdAt: (_c = (0, firebaseAdmin_1.toIso)(event.createdAt)) !== null && _c !== void 0 ? _c : null, teamName,
        coachName });
}
/**
 * Attach team and coach names to a batch of events.
 *
 * This used to be two queries *per event*, so a 30-event month cost 61 round trips.
 * Names are now resolved with one lookup per table over the distinct ids. An empty
 * batch short-circuits, which also keeps an empty array away from inArray.
 */
function enrichEvents(eventRows) {
    return __awaiter(this, void 0, void 0, function* () {
        if (eventRows.length === 0) {
            return [];
        }
        const teamIds = Array.from(new Set(eventRows.map((event) => event.teamId).filter((id) => id != null)));
        const coachIds = Array.from(new Set(eventRows.map((event) => event.coachId).filter((id) => id != null)));
        const [teamRows, coachRows] = yield Promise.all([
            teamIds.length
                ? db_1.db.select({ id: schema_1.teams.id, name: schema_1.teams.name }).from(schema_1.teams).where((0, drizzle_orm_1.inArray)(schema_1.teams.id, teamIds))
                : Promise.resolve([]),
            coachIds.length
                ? db_1.db.select({ id: schema_1.users.id, name: schema_1.users.name }).from(schema_1.users).where((0, drizzle_orm_1.inArray)(schema_1.users.id, coachIds))
                : Promise.resolve([]),
        ]);
        const teamNameById = new Map(teamRows.map((row) => [row.id, row.name]));
        const coachNameById = new Map(coachRows.map((row) => [row.id, row.name]));
        return eventRows.map((event) => {
            var _a, _b;
            return toEventPayload(event, event.teamId != null ? (_a = teamNameById.get(event.teamId)) !== null && _a !== void 0 ? _a : null : null, event.coachId != null ? (_b = coachNameById.get(event.coachId)) !== null && _b !== void 0 ? _b : null : null);
        });
    });
}
/** Single-event path (getEventById) — same shape, via the same code. */
function enrichEvent(event) {
    return __awaiter(this, void 0, void 0, function* () {
        const [enriched] = yield enrichEvents([event]);
        return enriched;
    });
}
function getRequestClubId(req) {
    var _a;
    return ((_a = req.user) === null || _a === void 0 ? void 0 : _a.clubId) == null ? null : Number(req.user.clubId);
}
function isSuperadmin(req) {
    var _a;
    return ((_a = req.user) === null || _a === void 0 ? void 0 : _a.role) === 'superadmin';
}
/**
 * Read access to a single event.
 *
 * Club-less events (teamId === null) used to skip the check entirely, which let
 * any authenticated user in any club read them — and their attendance rows.
 * Those events are now superadmin-only, since there is no club to scope them to.
 */
function ensureEventReadAccess(req, event) {
    return __awaiter(this, void 0, void 0, function* () {
        if (isSuperadmin(req)) {
            return null;
        }
        const clubId = getRequestClubId(req);
        if (clubId == null) {
            return { status: 403, error: 'Your account is not assigned to a club.' };
        }
        if (event.teamId == null) {
            return { status: 403, error: 'Access denied' };
        }
        const teamRows = yield db_1.db.select().from(schema_1.teams).where((0, drizzle_orm_1.eq)(schema_1.teams.id, event.teamId)).limit(1);
        if (!teamRows[0] || teamRows[0].clubId !== clubId) {
            return { status: 403, error: 'Access denied' };
        }
        return null;
    });
}
function ensureTeamAccess(req, teamId) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a;
        const rows = yield db_1.db.select().from(schema_1.teams).where((0, drizzle_orm_1.eq)(schema_1.teams.id, teamId)).limit(1);
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
        const role = (_a = req.user) === null || _a === void 0 ? void 0 : _a.role;
        if (role !== 'admin' && role !== 'coach' && role !== 'manager') {
            return { status: 403, error: 'You do not have permission to modify events for this team.' };
        }
        return { status: 200, team };
    });
}
exports.eventsController = {
    getEvents(req, res) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                // Resolve the caller's club teams first — the plan below needs them to
                // intersect any requested team ids against what the club actually owns.
                let allowedTeamIds = null;
                if (!isSuperadmin(req)) {
                    const clubId = getRequestClubId(req);
                    if (clubId != null) {
                        const clubTeams = yield db_1.db.select({ id: schema_1.teams.id }).from(schema_1.teams).where((0, drizzle_orm_1.eq)(schema_1.teams.clubId, clubId));
                        allowedTeamIds = clubTeams.map(t => t.id);
                    }
                }
                const plan = (0, eventQuery_1.buildEventQueryPlan)(req.query, {
                    isSuperadmin: isSuperadmin(req),
                    allowedTeamIds,
                });
                // No club, an out-of-club team request, or an unmatchable filter: answer
                // without touching the database.
                if (plan.empty) {
                    return res.json([]);
                }
                const conditions = [];
                if (plan.type) {
                    conditions.push((0, drizzle_orm_1.eq)(schema_1.events.type, plan.type));
                }
                if (plan.coachId != null) {
                    conditions.push((0, drizzle_orm_1.eq)(schema_1.events.coachId, plan.coachId));
                }
                // Inclusive at both ends, matching the old `<` / `>` rejection tests.
                if (plan.start) {
                    conditions.push((0, drizzle_orm_1.gte)(schema_1.events.startTime, plan.start));
                }
                if (plan.end) {
                    conditions.push((0, drizzle_orm_1.lte)(schema_1.events.startTime, plan.end));
                }
                if (plan.teamIds) {
                    // An explicit team filter excludes club-less events, exactly as
                    // `event.teamId !== Number(teamId)` did.
                    conditions.push((0, drizzle_orm_1.inArray)(schema_1.events.teamId, plan.teamIds));
                }
                else if (plan.clubTeamIds) {
                    // The tenancy restriction, by contrast, always let `team_id IS NULL`
                    // events through — the old check was `event.teamId != null && ...`.
                    // A bare inArray here would silently drop every club-less event.
                    conditions.push(plan.clubTeamIds.length
                        ? (0, drizzle_orm_1.or)((0, drizzle_orm_1.isNull)(schema_1.events.teamId), (0, drizzle_orm_1.inArray)(schema_1.events.teamId, plan.clubTeamIds))
                        : (0, drizzle_orm_1.isNull)(schema_1.events.teamId));
                }
                // `and()` of zero conditions is undefined, which Drizzle treats as "no
                // WHERE" — the only caller that reaches it is a superadmin who supplied no
                // filters, for whom "every event" is the correct answer.
                const eventRows = yield db_1.db.select().from(schema_1.events).where((0, drizzle_orm_1.and)(...conditions));
                res.json(yield enrichEvents(eventRows));
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
                const rows = yield db_1.db.select().from(schema_1.events).where((0, drizzle_orm_1.eq)(schema_1.events.id, eventId)).limit(1);
                const event = rows[0];
                if (!event) {
                    return res.status(404).json({ error: 'Event not found' });
                }
                const denied = yield ensureEventReadAccess(req, event);
                if (denied) {
                    return res.status(denied.status).json({ error: denied.error });
                }
                res.json(yield enrichEvent(event));
            }
            catch (error) {
                console.error('Get event by id error:', error);
                res.status(500).json({ error: 'Internal server error' });
            }
        });
    },
    createEvent(req, res) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, _b, _c;
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
                const access = yield ensureTeamAccess(req, teamId);
                if (access.status !== 200) {
                    return res.status(access.status).json({ error: access.error });
                }
                const [event] = yield db_1.db.insert(schema_1.events).values({
                    type: req.body.type || 'training',
                    title: String(req.body.title).trim(),
                    description: (_a = req.body.description) !== null && _a !== void 0 ? _a : null,
                    location: (_b = req.body.location) !== null && _b !== void 0 ? _b : null,
                    startTime: startTime.toISOString(),
                    endTime: endTime.toISOString(),
                    teamId,
                    coachId: req.body.coachId != null ? Number(req.body.coachId) : null,
                    amount: req.body.amount != null ? Number(req.body.amount) : null,
                    status: req.body.status || 'scheduled',
                    createdAt: new Date().toISOString(),
                    coachNote: (_c = req.body.coachNote) !== null && _c !== void 0 ? _c : null,
                }).returning();
                res.json(yield enrichEvent(event));
            }
            catch (error) {
                console.error('Create event error:', error);
                const message = error instanceof Error ? error.message : 'Internal server error';
                const isValidationError = /^(startTime|endTime) is invalid\.$/.test(message);
                res.status(isValidationError ? 400 : 500).json({ error: message });
            }
        });
    },
    updateEvent(req, res) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const eventId = Number(req.params.id);
                const existingRows = yield db_1.db.select().from(schema_1.events).where((0, drizzle_orm_1.eq)(schema_1.events.id, eventId)).limit(1);
                const existingEvent = existingRows[0];
                if (!existingEvent) {
                    return res.status(404).json({ error: 'Event not found' });
                }
                if (existingEvent.teamId != null) {
                    const access = yield ensureTeamAccess(req, existingEvent.teamId);
                    if (access.status !== 200) {
                        return res.status(access.status).json({ error: access.error });
                    }
                }
                else if (!isSuperadmin(req)) {
                    // No team means no club to scope the check to, so only a superadmin
                    // may touch it. Previously this branch was simply skipped.
                    return res.status(403).json({ error: 'Access denied' });
                }
                const updates = Object.assign(Object.assign(Object.assign(Object.assign(Object.assign(Object.assign(Object.assign(Object.assign(Object.assign(Object.assign(Object.assign({}, (req.body.type !== undefined ? { type: req.body.type } : {})), (req.body.title !== undefined ? { title: req.body.title } : {})), (req.body.description !== undefined ? { description: req.body.description } : {})), (req.body.location !== undefined ? { location: req.body.location } : {})), (req.body.startTime !== undefined ? { startTime: new Date(req.body.startTime).toISOString() } : {})), (req.body.endTime !== undefined ? { endTime: new Date(req.body.endTime).toISOString() } : {})), (req.body.teamId !== undefined ? { teamId: req.body.teamId == null ? null : Number(req.body.teamId) } : {})), (req.body.coachId !== undefined ? { coachId: req.body.coachId == null ? null : Number(req.body.coachId) } : {})), (req.body.amount !== undefined ? { amount: req.body.amount == null ? null : Number(req.body.amount) } : {})), (req.body.status !== undefined ? { status: req.body.status } : {})), (req.body.coachNote !== undefined ? { coachNote: req.body.coachNote } : {}));
                const [updated] = yield db_1.db.update(schema_1.events).set(updates).where((0, drizzle_orm_1.eq)(schema_1.events.id, eventId)).returning();
                res.json(yield enrichEvent(updated));
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
                const existingRows = yield db_1.db.select().from(schema_1.events).where((0, drizzle_orm_1.eq)(schema_1.events.id, eventId)).limit(1);
                const existingEvent = existingRows[0];
                if (!existingEvent) {
                    return res.status(404).json({ error: 'Event not found' });
                }
                if (existingEvent.teamId != null) {
                    const access = yield ensureTeamAccess(req, existingEvent.teamId);
                    if (access.status !== 200) {
                        return res.status(access.status).json({ error: access.error });
                    }
                }
                else if (!isSuperadmin(req)) {
                    // No team means no club to scope the check to, so only a superadmin
                    // may touch it. Previously this branch was simply skipped.
                    return res.status(403).json({ error: 'Access denied' });
                }
                yield db_1.db.delete(schema_1.attendance).where((0, drizzle_orm_1.eq)(schema_1.attendance.eventId, eventId));
                yield db_1.db.delete(schema_1.events).where((0, drizzle_orm_1.eq)(schema_1.events.id, eventId));
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
                const existingRows = yield db_1.db.select().from(schema_1.events).where((0, drizzle_orm_1.eq)(schema_1.events.id, eventId)).limit(1);
                const existingEvent = existingRows[0];
                if (!existingEvent) {
                    return res.status(404).json({ error: 'Event not found' });
                }
                const denied = yield ensureEventReadAccess(req, existingEvent);
                if (denied) {
                    return res.status(denied.status).json({ error: denied.error });
                }
                const attendanceRows = yield db_1.db.select().from(schema_1.attendance).where((0, drizzle_orm_1.eq)(schema_1.attendance.eventId, eventId));
                // Fetch only the players on this event's sheet. This previously loaded
                // every player row in the database and filtered in JS with an O(n·m)
                // `playerIds.includes` lookup inside the loop.
                const playerIds = Array.from(new Set(attendanceRows.map((row) => row.playerId)));
                const playerRows = playerIds.length
                    ? yield db_1.db.select().from(schema_1.players).where((0, drizzle_orm_1.inArray)(schema_1.players.id, playerIds))
                    : [];
                const playersById = new Map(playerRows.map((player) => [player.id, player]));
                res.json(attendanceRows.map((row) => {
                    var _a, _b, _c, _d;
                    const player = playersById.get(row.playerId);
                    return {
                        playerId: row.playerId,
                        firstName: (_a = player === null || player === void 0 ? void 0 : player.firstName) !== null && _a !== void 0 ? _a : '',
                        lastName: (_b = player === null || player === void 0 ? void 0 : player.lastName) !== null && _b !== void 0 ? _b : '',
                        number: (_c = player === null || player === void 0 ? void 0 : player.number) !== null && _c !== void 0 ? _c : null,
                        status: row.status,
                        note: (_d = row.note) !== null && _d !== void 0 ? _d : null,
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
                const eventRows = yield db_1.db.select().from(schema_1.events).where((0, drizzle_orm_1.eq)(schema_1.events.id, eventId)).limit(1);
                const event = eventRows[0];
                if (!event) {
                    return res.status(404).json({ error: 'Event not found' });
                }
                if (event.teamId != null) {
                    const access = yield ensureTeamAccess(req, event.teamId);
                    if (access.status !== 200) {
                        return res.status(access.status).json({ error: access.error });
                    }
                }
                else if (!isSuperadmin(req)) {
                    return res.status(403).json({ error: 'Access denied' });
                }
                for (const item of playerAttendances) {
                    const playerId = Number(item.playerId);
                    const status = String(item.status);
                    // Note is optional: only touch it when the caller explicitly sends
                    // a `note` key, so status-only updates (e.g. the quick toggle modal)
                    // never wipe an existing coach note.
                    const hasNote = Object.prototype.hasOwnProperty.call(item, 'note');
                    const note = hasNote ? (item.note == null ? null : String(item.note)) : undefined;
                    const existingRows = yield db_1.db.select().from(schema_1.attendance).where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.attendance.eventId, eventId), (0, drizzle_orm_1.eq)(schema_1.attendance.playerId, playerId))).limit(1);
                    const existing = existingRows[0];
                    if ((existing === null || existing === void 0 ? void 0 : existing.id) != null) {
                        yield db_1.db.update(schema_1.attendance)
                            .set(Object.assign({ status, date: new Date().toISOString() }, (hasNote ? { note } : {})))
                            .where((0, drizzle_orm_1.eq)(schema_1.attendance.id, existing.id));
                    }
                    else {
                        yield db_1.db.insert(schema_1.attendance).values({
                            playerId,
                            eventId,
                            teamId: (_b = event.teamId) !== null && _b !== void 0 ? _b : 0,
                            status,
                            date: new Date().toISOString(),
                            note: note !== null && note !== void 0 ? note : null,
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
                if (!isSuperadmin(req)) {
                    return res.status(403).json({ error: 'Only superadmin can sync FRB matches manually here.' });
                }
                const allTeams = yield db_1.db.select().from(schema_1.teams);
                const existingEvents = (yield db_1.db.select().from(schema_1.events)).map((event) => event);
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
                                    const [created] = yield db_1.db.insert(schema_1.events).values({
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
        });
    }
};
