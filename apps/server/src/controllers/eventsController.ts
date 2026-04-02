import { Request, Response } from 'express';
import { db } from '../db';
import { events, teams, users, attendance, players } from '../db/schema';
import { eq, and, gte, lte } from 'drizzle-orm';
import axios from 'axios';

const API_KEY = '9c3622c013ca2f69e8c373ecbf5af38e180f6d7d';
const REFERER = 'https://www.frbaschet.ro/';
const HEADERS = { Referer: REFERER };

function parseScore(rawScore: string): { home: string; away: string } {
    const clean = rawScore.replace(/\s+/g, '');
    const parts = clean.split('-');
    return { home: parts[0] || '?', away: parts[1] || '?' };
}

function determineResult(homeTeamName: string, homeScore: string, awayScore: string): 'W' | 'L' | 'N/A' {
    const h = parseInt(homeScore, 10);
    const a = parseInt(awayScore, 10);
    if (isNaN(h) || isNaN(a)) return 'N/A';
    return h > a ? 'W' : 'L';
}

function cleanText(s: string): string {
    if (!s) return '';
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

function parseFRBDate(dateStr: string): Date | null {
    if (!dateStr || dateStr.trim() === '') return null;
    const cleanStr = cleanText(dateStr);
    
    if (cleanStr.match(/\d{4}-\d{2}-\d{2}/)) {
        const asIso = cleanStr.replace(' ', 'T') + ':00Z';
        const parsed = new Date(asIso);
        if (!isNaN(parsed.getTime())) return parsed;
    }

    const parts = cleanStr.split(' ');
    const dmy = parts[0].split('.');
    
    if (dmy.length === 3) {
        let time = parts.length > 1 && parts[parts.length - 1].includes(':') ? parts[parts.length - 1] : '12:00';
        const parsedDate = new Date(`${dmy[2]}-${dmy[1]}-${dmy[0]}T${time}:00Z`);
        if (!isNaN(parsedDate.getTime())) return parsedDate;
    }
    
    const fb = new Date(cleanStr);
    if (!isNaN(fb.getTime())) return fb;
    
    return null;
}

export const eventsController = {
    async getEvents(req: Request, res: Response) {
        try {
            const { start, end, type, coachId, teamId } = req.query;
            
            let query = db.select({
                id: events.id,
                type: events.type,
                title: events.title,
                description: events.description,
                location: events.location,
                startTime: events.startTime,
                endTime: events.endTime,
                teamId: events.teamId,
                coachId: events.coachId,
                amount: events.amount,
                status: events.status,
                teamName: teams.name,
                coachName: users.name
            })
            .from(events)
            .leftJoin(teams, eq(events.teamId, teams.id))
            .leftJoin(users, eq(events.coachId, users.id));

            const filters = [];
            if (start) filters.push(gte(events.startTime, new Date(start as string)));
            if (end) filters.push(lte(events.startTime, new Date(end as string)));
            if (type) filters.push(eq(events.type, type as string));
            if (coachId) filters.push(eq(events.coachId, parseInt(coachId as string)));
            if (teamId) filters.push(eq(events.teamId, parseInt(teamId as string)));

            const results = await (filters.length > 0 ? query.where(and(...filters)) : query);
            res.json(results);
        } catch (error) {
            console.error('Get events error:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    },

    async getEventById(req: Request, res: Response) {
        try {
            const { id } = req.params;
            const result = await db.select({
                id: events.id,
                type: events.type,
                title: events.title,
                description: events.description,
                location: events.location,
                startTime: events.startTime,
                endTime: events.endTime,
                teamId: events.teamId,
                coachId: events.coachId,
                amount: events.amount,
                status: events.status,
                teamName: teams.name,
                coachName: users.name,
            })
            .from(events)
            .leftJoin(teams, eq(events.teamId, teams.id))
            .leftJoin(users, eq(events.coachId, users.id))
            .where(eq(events.id, parseInt(id as string)))
            .limit(1);

            if (result.length === 0) {
                return res.status(404).json({ error: 'Event not found' });
            }
            res.json(result[0]);
        } catch (error) {
            console.error('Get event by id error:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    },

    async createEvent(req: Request, res: Response) {
        try {
            const data = req.body;
            if (!data.title || !data.startTime || !data.endTime || !data.type) {
                return res.status(400).json({ error: 'Missing required fields' });
            }

            const result = await db.insert(events).values({
                ...data,
                startTime: new Date(data.startTime),
                endTime: new Date(data.endTime)
            }).returning();

            res.status(201).json(result[0]);
        } catch (error) {
            console.error('Create event error:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    },

    async updateEvent(req: Request, res: Response) {
        try {
            const { id } = req.params;
            const data = req.body;
            
            const updateValues: any = { ...data };
            if (data.startTime) updateValues.startTime = new Date(data.startTime);
            if (data.endTime) updateValues.endTime = new Date(data.endTime);

            const result = await db.update(events)
                .set(updateValues)
                .where(eq(events.id, parseInt(id as string)))
                .returning();

            res.json(result[0]);
        } catch (error) {
            console.error('Update event error:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    },

    async deleteEvent(req: Request, res: Response) {
        try {
            const { id } = req.params;
            await db.delete(events).where(eq(events.id, parseInt(id as string)));
            res.status(204).send();
        } catch (error) {
            console.error('Delete event error:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    },

    async getEventAttendance(req: Request, res: Response) {
        try {
            const { id } = req.params;
            
            // 1. Get the event to find its teamId
            const eventResult = await db.select().from(events).where(eq(events.id, parseInt(id as string))).limit(1);
            if (eventResult.length === 0) return res.status(404).json({ error: 'Event not found' });
            
            const event = eventResult[0];

            // 2. Fetch all players for that team (or all players if no team is assigned)
            let playersQuery = db.select({
                id: players.id,
                firstName: players.firstName,
                lastName: players.lastName,
                number: players.number,
            }).from(players);

            if (event.teamId) {
                playersQuery = playersQuery.where(eq(players.teamId, event.teamId)) as any;
            }

            const allTeamPlayers = await playersQuery;

            // 3. Fetch existing attendance records for this event
            const existingAttendance = await db.select()
                .from(attendance)
                .where(eq(attendance.eventId, parseInt(id as string)));

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
        } catch (error) {
            console.error('Get event attendance error:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    },

    async updateEventAttendance(req: Request, res: Response) {
        try {
            const { id } = req.params;
            const { playerAttendances } = req.body;

            if (!Array.isArray(playerAttendances)) {
                return res.status(400).json({ error: 'playerAttendances must be an array' });
            }

            for (const item of playerAttendances) {
                const eventId = parseInt(id as string);
                const playerId = item.playerId as number;

                const existing = await db.select()
                    .from(attendance)
                    .where(and(eq(attendance.eventId, eventId), eq(attendance.playerId, playerId)))
                    .limit(1);

                if (existing.length > 0) {
                    await db.update(attendance)
                        .set({ status: item.status as string, date: new Date() })
                        .where(eq(attendance.id, existing[0].id));
                } else {
                    const eventResult = await db.select().from(events).where(eq(events.id, eventId)).limit(1);
                    const teamId = eventResult.length > 0 ? eventResult[0].teamId || 0 : 0;

                    await db.insert(attendance).values({
                        playerId,
                        eventId,
                        teamId,
                        status: item.status as string,
                        date: new Date()
                    });
                }
            }

            res.json({ success: true });
        } catch (error) {
            console.error('Update event attendance error:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    },

    async syncFRBMatches(req: Request, res: Response) {
        try {
            const allTeams = await db.select().from(teams);
            let syncedCount = 0;

            for (const team of allTeams) {
                if (!team.frbTeamId || !team.frbSeasonId || !team.frbLeagueId) continue;

                // Month pagination bypassing strategy
                const monthPromises: any[] = [];
                for (let m = 1; m <= 12; m++) {
                    const url = `https://widgets.baskethotel.com/widget-service/show?&api=${API_KEY}&lang=ro&request[0][widget]=200&request[0][part]=schedule_and_results&request[0][param][team_id]=${team.frbTeamId}&request[0][param][league_id]=${team.frbLeagueId}&request[0][param][season_id]=${team.frbSeasonId}&request[0][param][month]=${m}`;
                    monthPromises.push(axios.get(url, { headers: HEADERS }).catch(() => null));
                }

                const responses = await Promise.all(monthPromises);

                for (const response of responses) {
                    if (!response || !response.data) continue;

                    const htmlMatch = (response.data as string).match(/MBT\.API\.update\('.*?',\s*'([\s\S]*?)'\);/);
                    if (!htmlMatch) continue;

                    let html = htmlMatch[1]
                        .replace(/\\n/g, '')
                        .replace(/\\"/g, '"')
                        .replace(/\\\//g, '/');

                    const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;

                    let rowMatch: RegExpExecArray | null;
                    while ((rowMatch = rowRegex.exec(html)) !== null) {
                        const rowHtml = rowMatch[1];
                        const cells: string[] = [];
                        let cellMatch: RegExpExecArray | null;
                        const cellReg = /<td[^>]*>([\s\S]*?)<\/td>/gi;
                        while ((cellMatch = cellReg.exec(rowHtml)) !== null) {
                            cells.push(cleanText(cellMatch[1]));
                        }

                        if (cells.length >= 4 && cells[0] !== '') {
                            const dateStr = cells[0];
                            const homeTeam = cells[1] || '';
                            const awayTeam = cells[3] || '';

                            if(!homeTeam && !awayTeam) continue;

                            const title = `${homeTeam} vs ${awayTeam}`;
                            const startTime = parseFRBDate(dateStr);
                            
                            if (!startTime) continue;

                            const endTime = new Date(startTime.getTime() + 2 * 60 * 60 * 1000);

                            const startDateOnly = new Date(startTime.getFullYear(), startTime.getMonth(), startTime.getDate());
                            const existingEvents = await db.select()
                                .from(events)
                                .where(and(
                                    eq(events.teamId, team.id), 
                                    eq(events.title, title)
                                ));
                                
                            const exists = existingEvents.some(e => {
                                    const d = new Date(e.startTime);
                                    return d.getFullYear() === startDateOnly.getFullYear() && 
                                           d.getMonth() === startDateOnly.getMonth() && 
                                           d.getDate() === startDateOnly.getDate();
                            });

                            if (!exists) {
                                await db.insert(events).values({
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
        } catch (error) {
            console.error('Sync FRB matches error:', error);
            res.status(500).json({ error: 'Internal server error while syncing matches' });
        }
    }
};
