import type { Response } from 'express';
import { and, desc, eq, gte, inArray, lte } from 'drizzle-orm';
import { db } from '../db';
import { eventResponses, events, notifications, players, playersToTeams, teams, users } from '../db/schema';
import type { AuthenticatedRequest } from '../middleware/auth';
import { toDate, toIso } from '../lib/dateUtils';
import { coachManagesEvent, coachReadsEvent } from '../lib/coachScope';
import { resolveSelfPlayerForRequest, teamIdsOfPlayers } from '../lib/selfPlayer';
import {
    REMINDER_COOLDOWN_MS,
    RESPONSES_CLOSED_MESSAGE,
    countResponses,
    eventNoun,
    eventTakesResponses,
    parseResponseInput,
    responsesOpen,
    shouldNotifyDecline,
} from '../lib/eventResponses';
import { notifyResponseDeclined, notifyResponseReminder } from '../lib/notifications';
import { auditRequest } from '../services/auditService';

/**
 * Attendance confirmation (Val 3) — lib/eventResponses.ts has the rules.
 *
 *  PUT  /events/:id/response           player / parent (selected child)
 *  GET  /events/responses/mine         player / parent
 *  GET  /events/:id/responses          admin; coach who reads the team
 *  POST /events/:id/responses/remind   admin; coach who manages the event
 */

type EventRow = typeof events.$inferSelect;
type TeamRow = typeof teams.$inferSelect;

const MAX_RANGE_MS = 400 * 24 * 60 * 60 * 1000;

function clubIdOf(req: AuthenticatedRequest) {
    return req.user?.clubId == null ? null : Number(req.user.clubId);
}

function isPlayerFacing(req: AuthenticatedRequest) {
    return req.user?.role === 'player' || req.user?.role === 'parent';
}

function playerName(player: { firstName: string | null; lastName: string | null; name?: string | null }) {
    return [player.firstName, player.lastName].filter(Boolean).join(' ').trim() || player.name?.trim() || 'Jucător';
}

/** The event and its team, if both exist and the team is in the caller's club. */
async function loadEventInClub(req: AuthenticatedRequest, rawId: unknown) {
    const eventId = Number(rawId);
    if (!Number.isInteger(eventId) || eventId <= 0) return { status: 400 as const, error: 'Eveniment invalid.' };
    const [event] = await db.select().from(events).where(eq(events.id, eventId)).limit(1);
    if (!event) return { status: 404 as const, error: 'Evenimentul nu mai există.' };
    if (event.teamId == null) return { status: 403 as const, error: 'Acces interzis.' };
    const [team] = await db.select().from(teams).where(eq(teams.id, event.teamId)).limit(1);
    const clubId = clubIdOf(req);
    if (!team || (req.user?.role !== 'superadmin' && (clubId == null || team.clubId !== clubId))) {
        return { status: 403 as const, error: 'Acces interzis.' };
    }
    return { status: 200 as const, event, team };
}

/** Active players of a team (primary team or membership), by name. */
async function teamRoster(teamId: number) {
    const [direct, members] = await Promise.all([
        db.select().from(players).where(eq(players.teamId, teamId)),
        db.select({ player: players }).from(playersToTeams)
            .innerJoin(players, eq(players.id, playersToTeams.playerId))
            .where(eq(playersToTeams.teamId, teamId)),
    ]);
    const byId = new Map<number, typeof players.$inferSelect>();
    [...direct, ...members.map((row) => row.player)].forEach((player) => {
        if ((player.status ?? 'active') !== 'inactive') byId.set(player.id, player);
    });
    return Array.from(byId.values()).sort((a, b) => playerName(a).localeCompare(playerName(b), 'ro'));
}

/** Staff may read the answers: an admin, or a coach who reads this team. */
function staffReads(req: AuthenticatedRequest, event: EventRow, team: TeamRow) {
    const role = req.user?.role;
    if (role === 'admin' || role === 'superadmin') return true;
    return role === 'coach' && coachReadsEvent(team.coachId, event.coachId, req.user?.id);
}

function staffReminds(req: AuthenticatedRequest, event: EventRow, team: TeamRow) {
    const role = req.user?.role;
    if (role === 'admin' || role === 'superadmin') return true;
    return role === 'coach' && coachManagesEvent(team.coachId, event.coachId, req.user?.id);
}

async function lastReminderAt(eventId: number) {
    const [row] = await db.select({ createdAt: notifications.createdAt }).from(notifications)
        .where(and(eq(notifications.eventId, eventId), eq(notifications.type, 'rsvp_reminder')))
        .orderBy(desc(notifications.createdAt))
        .limit(1);
    return row ? toDate(row.createdAt) : null;
}

function responderLabel(responder: { id: number; name: string | null; role: string | null } | null, player: { userId: number | null }) {
    if (!responder) return { name: null, relation: null };
    return {
        name: responder.name,
        relation: responder.role === 'parent' ? 'parent' as const : responder.id === player.userId || responder.role === 'player' ? 'player' as const : null,
    };
}

export const eventResponsesController = {
    async respond(req: AuthenticatedRequest, res: Response) {
        try {
            if (!isPlayerFacing(req)) {
                return res.status(403).json({ error: 'Doar jucătorii și părinții pot confirma participarea.' });
            }
            const parsed = parseResponseInput(req.body);
            if (!parsed.ok) return res.status(400).json({ error: parsed.error });

            const loaded = await loadEventInClub(req, req.params.id);
            if (loaded.status !== 200) return res.status(loaded.status).json({ error: loaded.error });
            const { event, team } = loaded;

            const player = await resolveSelfPlayerForRequest(req);
            if (!player || (player.status ?? 'active') === 'inactive') {
                return res.status(403).json({ error: 'Contul nu este legat de un jucător activ.' });
            }
            const playerTeams = await teamIdsOfPlayers([player.id]);
            if (!playerTeams.includes(team.id)) return res.status(403).json({ error: 'Acces interzis.' });

            if (!eventTakesResponses(event)) {
                return res.status(400).json({ error: 'Pentru acest eveniment nu se cere confirmare.' });
            }
            if (!responsesOpen(event.startTime)) {
                return res.status(409).json({ error: RESPONSES_CLOSED_MESSAGE, errorCode: 'RESPONSES_CLOSED' });
            }

            const [previous] = await db.select({ status: eventResponses.status }).from(eventResponses)
                .where(and(eq(eventResponses.eventId, event.id), eq(eventResponses.playerId, player.id))).limit(1);
            const now = new Date().toISOString();
            const values = { status: parsed.value.status, reason: parsed.value.reason, respondedBy: req.user!.id, updatedAt: now };
            const [saved] = await db.insert(eventResponses)
                .values({ eventId: event.id, playerId: player.id, ...values, createdAt: now })
                .onConflictDoUpdate({ target: [eventResponses.eventId, eventResponses.playerId], set: values })
                .returning();

            res.json({
                eventId: saved.eventId,
                status: saved.status,
                reason: saved.reason,
                respondedByName: req.user!.name ?? null,
                updatedAt: toIso(saved.updatedAt),
            });

            if (shouldNotifyDecline(previous?.status, parsed.value.status, false)) {
                const [sent] = await db.select({ id: notifications.id }).from(notifications)
                    .where(and(eq(notifications.eventId, event.id), eq(notifications.playerId, player.id), eq(notifications.type, 'rsvp_declined')))
                    .limit(1);
                if (shouldNotifyDecline(previous?.status, parsed.value.status, Boolean(sent))) {
                    notifyResponseDeclined({
                        clubId: Number(team.clubId),
                        coachIds: [team.coachId, event.coachId],
                        eventId: event.id,
                        playerId: player.id,
                        playerName: playerName(player),
                        noun: eventNoun(event.type),
                        startTime: String(event.startTime),
                        reason: parsed.value.reason,
                    }).catch((error) => console.error('[event-responses] decline notification failed:', error));
                }
            }
        } catch (error) {
            console.error('[event-responses] respond failed:', error);
            if (!res.headersSent) res.status(500).json({ error: 'Internal server error' });
        }
    },

    async mine(req: AuthenticatedRequest, res: Response) {
        try {
            if (!isPlayerFacing(req)) return res.json([]);
            const player = await resolveSelfPlayerForRequest(req);
            if (!player) return res.json([]);
            const teamIds = await teamIdsOfPlayers([player.id]);
            if (!teamIds.length) return res.json([]);

            const now = Date.now();
            const from = toDate(req.query.from) ?? new Date(now - 24 * 60 * 60 * 1000);
            let to = toDate(req.query.to) ?? new Date(now + 60 * 24 * 60 * 60 * 1000);
            if (to.getTime() - from.getTime() > MAX_RANGE_MS) to = new Date(from.getTime() + MAX_RANGE_MS);

            const rows = await db.select({
                eventId: eventResponses.eventId,
                status: eventResponses.status,
                reason: eventResponses.reason,
                updatedAt: eventResponses.updatedAt,
                responderName: users.name,
            }).from(eventResponses)
                .innerJoin(events, eq(events.id, eventResponses.eventId))
                .leftJoin(users, eq(users.id, eventResponses.respondedBy))
                .where(and(
                    eq(eventResponses.playerId, player.id),
                    inArray(events.teamId, teamIds),
                    gte(events.startTime, from.toISOString()),
                    lte(events.startTime, to.toISOString()),
                ));
            res.json(rows.map((row) => ({
                eventId: row.eventId,
                status: row.status,
                reason: row.reason,
                respondedByName: row.responderName ?? null,
                updatedAt: toIso(row.updatedAt),
            })));
        } catch (error) {
            console.error('[event-responses] mine failed:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    },

    async list(req: AuthenticatedRequest, res: Response) {
        try {
            const loaded = await loadEventInClub(req, req.params.id);
            if (loaded.status !== 200) return res.status(loaded.status).json({ error: loaded.error });
            const { event, team } = loaded;
            if (!staffReads(req, event, team)) {
                return res.status(403).json({ error: 'Poți vedea răspunsurile doar la echipele pe care le antrenezi.' });
            }

            const roster = await teamRoster(team.id);
            const rosterIds = roster.map((player) => player.id);
            const [answers, reminder] = await Promise.all([
                rosterIds.length
                    ? db.select({
                        playerId: eventResponses.playerId,
                        status: eventResponses.status,
                        reason: eventResponses.reason,
                        updatedAt: eventResponses.updatedAt,
                        responderId: users.id,
                        responderName: users.name,
                        responderRole: users.role,
                    }).from(eventResponses)
                        .leftJoin(users, eq(users.id, eventResponses.respondedBy))
                        .where(and(eq(eventResponses.eventId, event.id), inArray(eventResponses.playerId, rosterIds)))
                    : [],
                lastReminderAt(event.id),
            ]);
            const byPlayer = new Map(answers.map((row) => [row.playerId, row]));
            const takes = eventTakesResponses(event);
            const open = takes && responsesOpen(event.startTime);

            const rows = roster.map((player) => {
                const answer = byPlayer.get(player.id);
                const responder = answer?.responderId != null
                    ? responderLabel({ id: answer.responderId, name: answer.responderName, role: answer.responderRole }, player)
                    : { name: null, relation: null };
                return {
                    playerId: player.id,
                    firstName: player.firstName ?? '',
                    lastName: player.lastName ?? '',
                    number: player.number ?? null,
                    status: answer?.status ?? null,
                    reason: answer?.reason ?? null,
                    respondedByName: responder.name,
                    respondedByRelation: responder.relation,
                    updatedAt: answer ? toIso(answer.updatedAt) : null,
                };
            });

            res.json({
                eventId: event.id,
                enabled: takes,
                open,
                closesAt: toIso(event.startTime),
                canRemind: open && staffReminds(req, event, team),
                lastReminderAt: reminder ? reminder.toISOString() : null,
                counts: countResponses(rows.map((row) => row.status)),
                players: rows,
            });
        } catch (error) {
            console.error('[event-responses] list failed:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    },

    async remind(req: AuthenticatedRequest, res: Response) {
        try {
            const loaded = await loadEventInClub(req, req.params.id);
            if (loaded.status !== 200) return res.status(loaded.status).json({ error: loaded.error });
            const { event, team } = loaded;
            if (!staffReminds(req, event, team)) {
                return res.status(403).json({ error: 'Poți trimite amintiri doar la echipele pe care le antrenezi.' });
            }
            if (!eventTakesResponses(event)) {
                return res.status(400).json({ error: 'Pentru acest eveniment nu se cere confirmare.' });
            }
            if (!responsesOpen(event.startTime)) {
                return res.status(409).json({ error: RESPONSES_CLOSED_MESSAGE, errorCode: 'RESPONSES_CLOSED' });
            }
            const last = await lastReminderAt(event.id);
            if (last && Date.now() - last.getTime() < REMINDER_COOLDOWN_MS) {
                const nextAt = new Date(last.getTime() + REMINDER_COOLDOWN_MS);
                const time = new Intl.DateTimeFormat('ro-RO', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Bucharest' });
                return res.status(429).json({
                    error: `O amintire a plecat deja la ${time.format(last)}. Următoarea se poate trimite după ${time.format(nextAt)}.`,
                    errorCode: 'REMINDER_COOLDOWN',
                    nextAt: nextAt.toISOString(),
                });
            }

            const roster = await teamRoster(team.id);
            const rosterIds = roster.map((player) => player.id);
            const answered = rosterIds.length
                ? await db.select({ playerId: eventResponses.playerId }).from(eventResponses)
                    .where(and(eq(eventResponses.eventId, event.id), inArray(eventResponses.playerId, rosterIds)))
                : [];
            const answeredIds = new Set(answered.map((row) => row.playerId));
            const pending = rosterIds.filter((id) => !answeredIds.has(id));
            const sent = await notifyResponseReminder({ playerIds: pending, eventId: event.id, title: event.title, startTime: String(event.startTime) });

            await auditRequest(req, {
                action: 'event.responses_reminded',
                entityType: 'event',
                entityId: event.id,
                clubId: team.clubId ?? null,
                metadata: { players: pending.length, notifications: sent },
            });
            res.json({ players: pending.length, notifications: sent });
        } catch (error) {
            console.error('[event-responses] remind failed:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    },
};

