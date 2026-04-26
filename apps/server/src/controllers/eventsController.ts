import { Request, Response } from 'express';
import axios from 'axios';
import { admin, firestore, nextNumericId, toDate, toIso } from '../lib/firebaseAdmin';

const API_KEY = '9c3622c013ca2f69e8c373ecbf5af38e180f6d7d';
const REFERER = 'https://www.frbaschet.ro/';
const HEADERS = { Referer: REFERER };

type EventDoc = {
    id: number;
    type: 'training' | 'match' | 'camp' | 'admin';
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
};

type TeamDoc = { id: number; name: string; };
type UserDoc = { id: number; name: string; };
type PlayerDoc = { id: number; firstName?: string | null; lastName?: string | null; number?: number | null; };
type AttendanceDoc = { id: number; eventId?: number | null; playerId: number; teamId: number; status: string; date?: FirebaseFirestore.Timestamp | Date | string | null; };

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

async function enrichEvent(event: EventDoc) {
    const [teamSnap, coachSnap] = await Promise.all([
        event.teamId != null ? firestore.collection('teams').doc(String(event.teamId)).get() : Promise.resolve(null),
        event.coachId != null ? firestore.collection('users').where('id', '==', event.coachId).limit(1).get() : Promise.resolve(null),
    ]);

    const teamName = teamSnap?.exists ? (teamSnap.data() as TeamDoc).name : null;
    const coachName = coachSnap && 'docs' in coachSnap ? ((coachSnap.docs[0]?.data() as UserDoc | undefined)?.name ?? null) : null;

    return {
        ...event,
        startTime: toIso(event.startTime) ?? new Date().toISOString(),
        endTime: toIso(event.endTime) ?? new Date().toISOString(),
        createdAt: toIso(event.createdAt) ?? null,
        teamName,
        coachName,
    };
}

export const eventsController = {
    async getEvents(req: Request, res: Response) {
        try {
            const { start, end, type, coachId, teamId } = req.query as Record<string, string>;
            const snap = await firestore.collection('events').get();
            const events = snap.docs
                .map((docSnap) => docSnap.data() as EventDoc)
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
                    const eventDate = toDate(event.startTime);
                    if (!eventDate) return true;
                    if (startDate && eventDate < startDate) return false;
                    if (endDate && eventDate > endDate) return false;
                    return true;
                });

            const enriched = await Promise.all(events.map(enrichEvent));
            res.json(enriched);
        } catch (error) {
            console.error('[GET /api/events] error:', error);
            res.status(500).json({ error: 'Failed to fetch events' });
        }
    },

    async getEventById(req: Request, res: Response) {
        try {
            const eventId = Number(req.params.id);
            const snap = await firestore.collection('events').doc(String(eventId)).get();
            if (!snap.exists) {
                return res.status(404).json({ error: 'Event not found' });
            }

            res.json(await enrichEvent(snap.data() as EventDoc));
        } catch (error) {
            console.error('Get event by id error:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    },

    async createEvent(req: Request, res: Response) {
        try {
            const id = await nextNumericId('events');
            const event: EventDoc = {
                id,
                type: req.body.type || 'training',
                title: req.body.title || 'Untitled Event',
                description: req.body.description ?? null,
                location: req.body.location ?? null,
                startTime: req.body.startTime ? new Date(req.body.startTime) : new Date(),
                endTime: req.body.endTime ? new Date(req.body.endTime) : new Date(Date.now() + 60 * 60 * 1000),
                teamId: req.body.teamId != null ? Number(req.body.teamId) : null,
                coachId: req.body.coachId != null ? Number(req.body.coachId) : null,
                amount: req.body.amount != null ? Number(req.body.amount) : null,
                status: req.body.status || 'scheduled',
                createdAt: new Date(),
            };

            await firestore.collection('events').doc(String(id)).set(event);
            res.json(await enrichEvent(event));
        } catch (error) {
            console.error('Create event error:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    },

    async updateEvent(req: Request, res: Response) {
        try {
            const eventId = Number(req.params.id);
            const snap = await firestore.collection('events').doc(String(eventId)).get();
            if (!snap.exists) {
                return res.status(404).json({ error: 'Event not found' });
            }

            const updates = {
                ...(req.body.type !== undefined ? { type: req.body.type } : {}),
                ...(req.body.title !== undefined ? { title: req.body.title } : {}),
                ...(req.body.description !== undefined ? { description: req.body.description } : {}),
                ...(req.body.location !== undefined ? { location: req.body.location } : {}),
                ...(req.body.startTime !== undefined ? { startTime: new Date(req.body.startTime) } : {}),
                ...(req.body.endTime !== undefined ? { endTime: new Date(req.body.endTime) } : {}),
                ...(req.body.teamId !== undefined ? { teamId: req.body.teamId == null ? null : Number(req.body.teamId) } : {}),
                ...(req.body.coachId !== undefined ? { coachId: req.body.coachId == null ? null : Number(req.body.coachId) } : {}),
                ...(req.body.amount !== undefined ? { amount: req.body.amount == null ? null : Number(req.body.amount) } : {}),
                ...(req.body.status !== undefined ? { status: req.body.status } : {}),
            };

            await snap.ref.set(updates, { merge: true });
            const updated = await snap.ref.get();
            res.json(await enrichEvent(updated.data() as EventDoc));
        } catch (error) {
            console.error('Update event error:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    },

    async deleteEvent(req: Request, res: Response) {
        try {
            const eventId = Number(req.params.id);
            const batch = firestore.batch();
            const attendanceSnap = await firestore.collection('attendance').where('eventId', '==', eventId).get();
            attendanceSnap.docs.forEach((docSnap) => batch.delete(docSnap.ref));
            batch.delete(firestore.collection('events').doc(String(eventId)));
            await batch.commit();
            res.json({ success: true });
        } catch (error) {
            console.error('Delete event error:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    },

    async getEventAttendance(req: Request, res: Response) {
        try {
            const eventId = Number(req.params.id);
            const attendanceSnap = await firestore.collection('attendance').where('eventId', '==', eventId).get();
            const attendanceRows = attendanceSnap.docs.map((docSnap) => docSnap.data() as AttendanceDoc);

            const playerIds = attendanceRows.map((row) => row.playerId);
            const playersSnap = await firestore.collection('players').get();
            const playersById = new Map<number, PlayerDoc>();
            playersSnap.docs.forEach((docSnap) => {
                const player = docSnap.data() as PlayerDoc;
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
        } catch (error) {
            console.error('Get event attendance error:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    },

    async updateEventAttendance(req: Request, res: Response) {
        try {
            const eventId = Number(req.params.id);
            const playerAttendances = Array.isArray(req.body?.playerAttendances) ? req.body.playerAttendances : [];
            const eventSnap = await firestore.collection('events').doc(String(eventId)).get();

            if (!eventSnap.exists) {
                return res.status(404).json({ error: 'Event not found' });
            }

            const event = eventSnap.data() as EventDoc;
            const batch = firestore.batch();

            for (const item of playerAttendances) {
                const playerId = Number(item.playerId);
                const status = String(item.status);
                const existingSnap = await firestore.collection('attendance')
                    .where('eventId', '==', eventId)
                    .where('playerId', '==', playerId)
                    .limit(1)
                    .get();

                const existing = existingSnap.docs[0];
                if (existing) {
                    batch.set(existing.ref, { status, date: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
                } else {
                    const id = await nextNumericId('attendance');
                    batch.set(firestore.collection('attendance').doc(String(id)), {
                        id,
                        playerId,
                        eventId,
                        teamId: event.teamId ?? 0,
                        status,
                        date: admin.firestore.FieldValue.serverTimestamp(),
                    });
                }
            }

            await batch.commit();
            res.json({ success: true });
        } catch (error) {
            console.error('Update event attendance error:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    },

    async syncFRBMatches(_req: Request, res: Response) {
        try {
            const teamsSnap = await firestore.collection('teams').get();
            const allTeams = teamsSnap.docs.map((docSnap) => docSnap.data() as { id: number; frbTeamId?: string; frbSeasonId?: string; frbLeagueId?: string; name: string; });
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
                            const awayTeam = cells[3] || '';
                            if (!homeTeam && !awayTeam) continue;

                            const title = `${homeTeam} vs ${awayTeam}`;
                            const startTime = parseFRBDate(dateStr);
                            if (!startTime) continue;

                            const endTime = new Date(startTime.getTime() + 2 * 60 * 60 * 1000);
                            const startDateOnly = new Date(startTime.getFullYear(), startTime.getMonth(), startTime.getDate());
                            const allEventsSnap = await firestore.collection('events').get();
                            const exists = allEventsSnap.docs.some((docSnap) => {
                                const event = docSnap.data() as EventDoc;
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
                                const id = await nextNumericId('events');
                                await firestore.collection('events').doc(String(id)).set({
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
        } catch (error) {
            console.error('Sync FRB matches error:', error);
            res.status(500).json({ error: 'Internal server error while syncing matches' });
        }
    }
};
