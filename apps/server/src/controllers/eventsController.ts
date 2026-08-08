import { Request, Response } from 'express';
import axios from 'axios';
import { toDate, toIso } from '../lib/firebaseAdmin';
import { db } from '../db';
import { attendance, events, players, teams, users } from '../db/schema';
import { and, eq, gte, inArray, isNull, lte, or } from 'drizzle-orm';
import { AuthenticatedRequest } from '../middleware/auth';
import { buildEventQueryPlan, type EventQueryParams } from '../lib/eventQuery';
import { createFeedbackNotification } from '../lib/notifications';

const API_KEY = '9c3622c013ca2f69e8c373ecbf5af38e180f6d7d';
const REFERER = 'https://www.frbaschet.ro/';
const HEADERS = { Referer: REFERER };

type EventDoc = {
    id: number;
    type: 'training' | 'match' | 'camp' | 'admin' | 'medical';
    title: string;
    description?: string | null;
    location?: string | null;
    startTime: FirebaseFirestore.Timestamp | Date | string;
    endTime: FirebaseFirestore.Timestamp | Date | string;
    teamId?: number | null;
    coachId?: number | null;
    amount?: number | null;
    status?: string;
    createdAt?: FirebaseFirestore.Timestamp | Date | string | null;
    coachNote?: string | null;
};

type PlayerDoc = { id: number; firstName?: string | null; lastName?: string | null; number?: number | null; };
type AttendanceDoc = { id: number; eventId?: number | null; playerId: number; teamId: number; status: string; date?: FirebaseFirestore.Timestamp | Date | string | null; };

function parseRequiredDate(value: unknown, fieldName: string) {
    const date = value ? new Date(String(value)) : null;
    if (!date || Number.isNaN(date.getTime())) {
        throw new Error(`${fieldName} is invalid.`);
    }

    return date;
}

function parseFRBDate(dateStr: string) {
    const match = /(\d{2})\.(\d{2})\.(\d{4})(?:\s+(\d{2}):(\d{2}))?/.exec(dateStr);
    if (!match) {
        return null;
    }

    const [, d, m, y, hh, mm] = match;
    return new Date(Number(y), Number(m) - 1, Number(d), Number(hh ?? '0'), Number(mm ?? '0'));
}

function cleanText(text: string) {
    return text.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
}

function parseScore(rawScore: string): { home: string; away: string } {
    const clean = (rawScore || '').replace(/\s+/g, '').trim();
    if (!clean || clean === '?' || clean === '-' || !/\d/.test(clean)) {
        return { home: '', away: '' };
    }

    const parts = clean.split('-');
    if (parts.length !== 2) return { home: '', away: '' };

    const h = parts[0].trim();
    const a = parts[1].trim();
    if (!/^\d+$/.test(h) || !/^\d+$/.test(a)) {
        return { home: '', away: '' };
    }

    return { home: h, away: a };
}

function determineStatus(homeScore: string, awayScore: string) {
    return !homeScore || !awayScore ? 'scheduled' : 'finished';
}

function toEventPayload(event: EventDoc, teamName: string | null, coachName: string | null) {
    return {
        ...event,
        startTime: toIso(event.startTime) ?? new Date().toISOString(),
        endTime: toIso(event.endTime) ?? new Date().toISOString(),
        createdAt: toIso(event.createdAt) ?? null,
        teamName,
        coachName,
    };
}

/**
 * Attach team and coach names to a batch of events.
 *
 * This used to be two queries *per event*, so a 30-event month cost 61 round trips.
 * Names are now resolved with one lookup per table over the distinct ids. An empty
 * batch short-circuits, which also keeps an empty array away from inArray.
 */
async function enrichEvents(eventRows: EventDoc[]) {
    if (eventRows.length === 0) {
        return [];
    }

    const teamIds = Array.from(new Set(
        eventRows.map((event) => event.teamId).filter((id): id is number => id != null)
    ));
    const coachIds = Array.from(new Set(
        eventRows.map((event) => event.coachId).filter((id): id is number => id != null)
    ));

    const [teamRows, coachRows] = await Promise.all([
        teamIds.length
            ? db.select({ id: teams.id, name: teams.name }).from(teams).where(inArray(teams.id, teamIds))
            : Promise.resolve([] as { id: number; name: string }[]),
        coachIds.length
            ? db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, coachIds))
            : Promise.resolve([] as { id: number; name: string }[]),
    ]);

    const teamNameById = new Map(teamRows.map((row) => [row.id, row.name]));
    const coachNameById = new Map(coachRows.map((row) => [row.id, row.name]));

    return eventRows.map((event) => toEventPayload(
        event,
        event.teamId != null ? teamNameById.get(event.teamId) ?? null : null,
        event.coachId != null ? coachNameById.get(event.coachId) ?? null : null,
    ));
}

/** Single-event path (getEventById) — same shape, via the same code. */
async function enrichEvent(event: EventDoc) {
    const [enriched] = await enrichEvents([event]);
    return enriched;
}

function getRequestClubId(req: AuthenticatedRequest) {
    return req.user?.clubId == null ? null : Number(req.user.clubId);
}

function isSuperadmin(req: AuthenticatedRequest) {
    return req.user?.role === 'superadmin';
}

/**
 * Read access to a single event.
 *
 * Club-less events (teamId === null) used to skip the check entirely, which let
 * any authenticated user in any club read them — and their attendance rows.
 * Those events are now superadmin-only, since there is no club to scope them to.
 */
async function ensureEventReadAccess(req: AuthenticatedRequest, event: { teamId: number | null }) {
    if (isSuperadmin(req)) {
        return null;
    }

    const clubId = getRequestClubId(req);
    if (clubId == null) {
        return { status: 403 as const, error: 'Your account is not assigned to a club.' };
    }

    if (event.teamId == null) {
        return { status: 403 as const, error: 'Access denied' };
    }

    const teamRows = await db.select().from(teams).where(eq(teams.id, event.teamId)).limit(1);
    if (!teamRows[0] || teamRows[0].clubId !== clubId) {
        return { status: 403 as const, error: 'Access denied' };
    }

    return null;
}

async function ensureTeamAccess(req: AuthenticatedRequest, teamId: number) {
    const rows = await db.select().from(teams).where(eq(teams.id, teamId)).limit(1);
    const team = rows[0];
    if (!team) {
        return { status: 404 as const, error: 'Team not found.' };
    }

    if (isSuperadmin(req)) {
        return { status: 200 as const, team };
    }

    const requestClubId = getRequestClubId(req);
    if (requestClubId == null) {
        return { status: 403 as const, error: 'Your account is not assigned to a club.' };
    }

    if (team.clubId !== requestClubId) {
        return { status: 403 as const, error: 'You do not have access to this team.' };
    }

    const role = req.user?.role;
    if (role !== 'admin' && role !== 'coach' && role !== 'manager') {
        return { status: 403 as const, error: 'You do not have permission to modify events for this team.' };
    }

    return { status: 200 as const, team };
}

export const eventsController = {
    async getEvents(req: AuthenticatedRequest, res: Response) {
        try {
            // Resolve the caller's club teams first — the plan below needs them to
            // intersect any requested team ids against what the club actually owns.
            let allowedTeamIds: number[] | null = null;
            if (!isSuperadmin(req)) {
                const clubId = getRequestClubId(req);
                if (clubId != null) {
                    const clubTeams = await db.select({ id: teams.id }).from(teams).where(eq(teams.clubId, clubId));
                    allowedTeamIds = clubTeams.map(t => t.id);
                }
            }

            const plan = buildEventQueryPlan(req.query as EventQueryParams, {
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
                conditions.push(eq(events.type, plan.type));
            }
            if (plan.coachId != null) {
                conditions.push(eq(events.coachId, plan.coachId));
            }
            // Inclusive at both ends, matching the old `<` / `>` rejection tests.
            if (plan.start) {
                conditions.push(gte(events.startTime, plan.start));
            }
            if (plan.end) {
                conditions.push(lte(events.startTime, plan.end));
            }

            if (plan.teamIds) {
                // An explicit team filter excludes club-less events, exactly as
                // `event.teamId !== Number(teamId)` did.
                conditions.push(inArray(events.teamId, plan.teamIds));
            } else if (plan.clubTeamIds) {
                // The tenancy restriction, by contrast, always let `team_id IS NULL`
                // events through — the old check was `event.teamId != null && ...`.
                // A bare inArray here would silently drop every club-less event.
                conditions.push(plan.clubTeamIds.length
                    ? or(isNull(events.teamId), inArray(events.teamId, plan.clubTeamIds))
                    : isNull(events.teamId));
            }

            // `and()` of zero conditions is undefined, which Drizzle treats as "no
            // WHERE" — the only caller that reaches it is a superadmin who supplied no
            // filters, for whom "every event" is the correct answer.
            const eventRows = await db.select().from(events).where(and(...conditions));

            res.json(await enrichEvents(eventRows as EventDoc[]));
        } catch (error) {
            console.error('[GET /api/events] error:', error);
            res.status(500).json({ error: 'Failed to fetch events' });
        }
    },

    async getEventById(req: AuthenticatedRequest, res: Response) {
        try {
            const eventId = Number(req.params.id);
            const rows = await db.select().from(events).where(eq(events.id, eventId)).limit(1);
            const event = rows[0];
            if (!event) {
                return res.status(404).json({ error: 'Event not found' });
            }

            const denied = await ensureEventReadAccess(req, event);
            if (denied) {
                return res.status(denied.status).json({ error: denied.error });
            }

            res.json(await enrichEvent(event as EventDoc));
        } catch (error) {
            console.error('Get event by id error:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    },

    async createEvent(req: AuthenticatedRequest, res: Response) {
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

            const [event] = await db.insert(events).values({
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
                coachNote: req.body.coachNote ?? null,
            }).returning();

            res.json(await enrichEvent(event as EventDoc));
        } catch (error) {
            console.error('Create event error:', error);
            const message = error instanceof Error ? error.message : 'Internal server error';
            const isValidationError = /^(startTime|endTime) is invalid\.$/.test(message);
            res.status(isValidationError ? 400 : 500).json({ error: message });
        }
    },

    async updateEvent(req: AuthenticatedRequest, res: Response) {
        try {
            const eventId = Number(req.params.id);
            const existingRows = await db.select().from(events).where(eq(events.id, eventId)).limit(1);
            const existingEvent = existingRows[0];
            if (!existingEvent) {
                return res.status(404).json({ error: 'Event not found' });
            }

            if (existingEvent.teamId != null) {
                const access = await ensureTeamAccess(req, existingEvent.teamId);
                if (access.status !== 200) {
                    return res.status(access.status).json({ error: access.error });
                }
            } else if (!isSuperadmin(req)) {
                // No team means no club to scope the check to, so only a superadmin
                // may touch it. Previously this branch was simply skipped.
                return res.status(403).json({ error: 'Access denied' });
            }

            const updates: Partial<typeof events.$inferInsert> = {
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
                ...(req.body.coachNote !== undefined ? { coachNote: req.body.coachNote } : {}),
            };

            const [updated] = await db.update(events).set(updates).where(eq(events.id, eventId)).returning();
            res.json(await enrichEvent(updated as EventDoc));
        } catch (error) {
            console.error('Update event error:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    },

    async deleteEvent(req: AuthenticatedRequest, res: Response) {
        try {
            const eventId = Number(req.params.id);
            const existingRows = await db.select().from(events).where(eq(events.id, eventId)).limit(1);
            const existingEvent = existingRows[0];
            if (!existingEvent) {
                return res.status(404).json({ error: 'Event not found' });
            }

            if (existingEvent.teamId != null) {
                const access = await ensureTeamAccess(req, existingEvent.teamId);
                if (access.status !== 200) {
                    return res.status(access.status).json({ error: access.error });
                }
            } else if (!isSuperadmin(req)) {
                // No team means no club to scope the check to, so only a superadmin
                // may touch it. Previously this branch was simply skipped.
                return res.status(403).json({ error: 'Access denied' });
            }

            await db.delete(attendance).where(eq(attendance.eventId, eventId));
            await db.delete(events).where(eq(events.id, eventId));
            res.json({ success: true });
        } catch (error) {
            console.error('Delete event error:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    },

    async getEventAttendance(req: AuthenticatedRequest, res: Response) {
        try {
            const eventId = Number(req.params.id);
            const existingRows = await db.select().from(events).where(eq(events.id, eventId)).limit(1);
            const existingEvent = existingRows[0];
            if (!existingEvent) {
                return res.status(404).json({ error: 'Event not found' });
            }

            const denied = await ensureEventReadAccess(req, existingEvent);
            if (denied) {
                return res.status(denied.status).json({ error: denied.error });
            }

            const attendanceRows = await db.select().from(attendance).where(eq(attendance.eventId, eventId));

            // Fetch only the players on this event's sheet. This previously loaded
            // every player row in the database and filtered in JS with an O(n·m)
            // `playerIds.includes` lookup inside the loop.
            const playerIds = Array.from(new Set(attendanceRows.map((row) => row.playerId)));
            const playerRows = playerIds.length
                ? await db.select().from(players).where(inArray(players.id, playerIds))
                : [];
            const playersById = new Map<number, PlayerDoc>(
                playerRows.map((player) => [player.id, player as PlayerDoc]),
            );

            res.json(attendanceRows.map((row) => {
                const player = playersById.get(row.playerId);
                return {
                    playerId: row.playerId,
                    firstName: player?.firstName ?? '',
                    lastName: player?.lastName ?? '',
                    number: player?.number ?? null,
                    status: row.status,
                    note: row.note ?? null,
                };
            }));
        } catch (error) {
            console.error('Get event attendance error:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    },

    async updateEventAttendance(req: AuthenticatedRequest, res: Response) {
        try {
            const eventId = Number(req.params.id);
            const playerAttendances = Array.isArray(req.body?.playerAttendances) ? req.body.playerAttendances : [];
            const eventRows = await db.select().from(events).where(eq(events.id, eventId)).limit(1);
            const event = eventRows[0];

            if (!event) {
                return res.status(404).json({ error: 'Event not found' });
            }

            if (event.teamId != null) {
                const access = await ensureTeamAccess(req, event.teamId);
                if (access.status !== 200) {
                    return res.status(access.status).json({ error: access.error });
                }
            } else if (!isSuperadmin(req)) {
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
                const existingRows = await db.select().from(attendance).where(and(eq(attendance.eventId, eventId), eq(attendance.playerId, playerId))).limit(1);
                const existing = existingRows[0];

                if (existing?.id != null) {
                    await db.update(attendance)
                        .set({ status, date: new Date().toISOString(), ...(hasNote ? { note } : {}) })
                        .where(eq(attendance.id, existing.id));
                } else {
                    await db.insert(attendance).values({
                        playerId,
                        eventId,
                        teamId: event.teamId ?? 0,
                        status,
                        date: new Date().toISOString(),
                        note: note ?? null,
                    });
                }

                // Notify the player only when a new/changed non-empty note was
                // actually sent — a status-only re-save or an unchanged note
                // must not spam a duplicate notification. A notification
                // failure must not fail the attendance save itself.
                if (hasNote && note && note !== existing?.note) {
                    try {
                        await createFeedbackNotification({
                            playerId,
                            eventId,
                            eventTitle: event.title,
                            note,
                        });
                    } catch (notificationError) {
                        console.error('Create feedback notification error:', notificationError);
                    }
                }
            }

            res.json({ success: true });
        } catch (error) {
            console.error('Update event attendance error:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    },

    async syncFRBMatches(req: AuthenticatedRequest, res: Response) {
        try {
            if (!isSuperadmin(req)) {
                return res.status(403).json({ error: 'Only superadmin can sync FRB matches manually here.' });
            }

            const allTeams = await db.select().from(teams);
            const existingEvents = (await db.select().from(events)).map((event) => event as EventDoc);
            let syncedCount = 0;

            for (const team of allTeams) {
                if (!team.frbTeamId || !team.frbSeasonId || !team.frbLeagueId) continue;

                const responses: Array<{ data?: string } | null> = await Promise.all(Array.from({ length: 12 }, (_, idx) => idx + 1).map((month) => {
                    const url = `https://widgets.baskethotel.com/widget-service/show?&api=${API_KEY}&lang=ro&request[0][widget]=200&request[0][part]=schedule_and_results&request[0][param][team_id]=${team.frbTeamId}&request[0][param][league_id]=${team.frbLeagueId}&request[0][param][season_id]=${team.frbSeasonId}&request[0][param][month]=${month}`;
                    return axios.get(url, { headers: HEADERS }).catch(() => null);
                }));

                for (const response of responses) {
                    if (!response || !response.data) continue;

                    const htmlMatch = (response.data as string).match(/MBT\.API\.update\('.*?',\s*'([\s\S]*?)'\);/);
                    if (!htmlMatch) continue;

                    const html = htmlMatch[1].replace(/\\n/g, '').replace(/\\"/g, '"').replace(/\\\//g, '/');
                    const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
                    let rowMatch: RegExpExecArray | null;
                    while ((rowMatch = rowRegex.exec(html)) !== null) {
                        const rowHtml = rowMatch[1];
                        const cells: string[] = [];
                        const cellReg = /<td[^>]*>([\s\S]*?)<\/td>/gi;
                        let cellMatch: RegExpExecArray | null;
                        while ((cellMatch = cellReg.exec(rowHtml)) !== null) {
                            cells.push(cleanText(cellMatch[1]));
                        }

                        if (cells.length >= 4 && cells[0] !== '') {
                            const dateStr = cells[0];
                            const homeTeam = cells[1] || '';
                            const score = parseScore(cells[2] || '');
                            const awayTeam = cells[3] || '';
                            if (!homeTeam && !awayTeam) continue;

                            const title = `${homeTeam} vs ${awayTeam}`;
                            const startTime = parseFRBDate(dateStr);
                            if (!startTime) continue;

                            const endTime = new Date(startTime.getTime() + 2 * 60 * 60 * 1000);
                            const startDateOnly = new Date(startTime.getFullYear(), startTime.getMonth(), startTime.getDate());
                            const exists = existingEvents.some((event) => {
                                if (event.teamId !== team.id || event.title !== title) {
                                    return false;
                                }
                                const d = toDate(event.startTime);
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
                                const [created] = await db.insert(events).values({
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
                                existingEvents.push(created as EventDoc);
                                syncedCount++;
                            }
                        }
                    }
                }
            }

            res.json({ success: true, syncedCount });
        } catch (error) {
            console.error('Sync FRB matches error:', error);
            res.status(500).json({ error: 'Internal server error while syncing matches' });
        }
    }
};
