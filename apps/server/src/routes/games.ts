import { Router, type Response } from 'express';
import { and, asc, eq, inArray, ne, sql } from 'drizzle-orm';
import { authenticate, type AuthenticatedRequest } from '../middleware/auth';
import { rateLimit } from '../middleware/rateLimit';
import { db } from '../db';
import { events, gameStatEvents, gameStats, l12Lineups, playerGuardians, players, playersToTeams, teams, users } from '../db/schema';
import { computeBoxScore, parseEvent, parseOpponentRoster, type GameEvent, type GameMode } from '../lib/gameStats';
import { toIso } from '../lib/dateUtils';

/**
 * Live match statistics.
 *
 *   GET  /api/games/assigned              → open games the caller was asked to keep
 *   GET  /api/games/events/:eventId       → game + events (any club member may read)
 *   GET  /api/games/events/:eventId/keepers → who can be asked to keep stats
 *   PUT  /api/games/events/:eventId/setup → mode, roster, starters, opponent, scorekeeper
 *   POST /api/games/events/:eventId/events → append/undo events (idempotent by clientId)
 *   POST /api/games/events/:eventId/finish
 *
 * Keeping stats: club admins, coaches and staff, or the person a coach
 * delegated for that match (often a parent). Setup: admins/coaches/staff only.
 */

const router = Router();
router.use(authenticate);

const STAFF_ROLES = new Set(['admin', 'coach', 'staff', 'superadmin']);

type RosterEntry = { playerId: number; number: string; firstName: string; lastName: string };
type LineupEntry = RosterEntry & { onL12: boolean };

function clubIdOf(req: AuthenticatedRequest) {
    return req.user?.clubId == null ? null : Number(req.user.clubId);
}

async function loadMatch(req: AuthenticatedRequest, res: Response) {
    const eventId = Number(req.params.eventId);
    if (!Number.isInteger(eventId) || eventId <= 0) {
        res.status(400).json({ error: 'Meci invalid.' });
        return null;
    }
    const [row] = await db.select({ event: events, team: teams }).from(events)
        .innerJoin(teams, eq(teams.id, events.teamId))
        .where(eq(events.id, eventId)).limit(1);
    const isSuper = req.user?.role === 'superadmin';
    if (!row || (!isSuper && row.team.clubId !== clubIdOf(req))) {
        res.status(404).json({ error: 'Meciul nu există.' });
        return null;
    }
    const [game] = await db.select().from(gameStats).where(eq(gameStats.eventId, eventId)).limit(1);
    const staff = STAFF_ROLES.has(String(req.user?.role ?? ''));
    const canKeep = staff || (game != null && game.scorekeeperUserId === Number(req.user?.id));
    return { event: row.event, team: row.team, game: game ?? null, staff, canKeep };
}

/** The team's players, numbered from the match's L12 when there is one. */
async function lineupFor(teamId: number, eventId: number): Promise<LineupEntry[]> {
    const [direct, memberships, [lineup]] = await Promise.all([
        db.select().from(players).where(eq(players.teamId, teamId)),
        db.select({ player: players }).from(playersToTeams).innerJoin(players, eq(players.id, playersToTeams.playerId)).where(eq(playersToTeams.teamId, teamId)),
        db.select().from(l12Lineups).where(eq(l12Lineups.eventId, eventId)).limit(1),
    ]);
    const byId = new Map<number, typeof players.$inferSelect>();
    direct.forEach((p) => byId.set(p.id, p));
    memberships.forEach(({ player }) => byId.set(player.id, player));
    const l12 = new Map<number, string>(
        (Array.isArray(lineup?.players) ? lineup!.players as { playerId: number; shirtNumber?: string }[] : [])
            .map((p) => [p.playerId, p.shirtNumber ?? '']),
    );
    return Array.from(byId.values())
        .filter((p) => (p.status ?? 'active') !== 'inactive')
        .map((p) => ({
            playerId: p.id,
            number: l12.get(p.id) || (p.number != null ? String(p.number) : ''),
            firstName: p.firstName ?? '',
            lastName: p.lastName ?? p.name ?? '',
            onL12: l12.has(p.id),
        }))
        // Players on the match's L12 first, then by shirt number.
        .sort((a, b) => Number(b.onL12) - Number(a.onL12) || (Number(a.number || 999) - Number(b.number || 999)));
}

function serializeGame(game: typeof gameStats.$inferSelect) {
    return {
        id: game.id,
        eventId: game.eventId,
        mode: game.mode as GameMode,
        status: game.status,
        periodSec: game.periodSec,
        opponentName: game.opponentName,
        opponentRoster: game.opponentRoster,
        roster: game.roster,
        starters: game.starters,
        scorekeeperUserId: game.scorekeeperUserId,
        scoreUs: game.scoreUs,
        scoreThem: game.scoreThem,
        currentPeriod: game.currentPeriod,
        clockSec: game.clockSec,
        updatedAt: toIso(game.updatedAt),
        finishedAt: toIso(game.finishedAt),
    };
}

function serializeEvent(row: typeof gameStatEvents.$inferSelect): GameEvent {
    return {
        clientId: row.clientId,
        seq: row.seq,
        period: row.period,
        clockSec: row.clockSec,
        side: row.side === 'them' ? 'them' : 'us',
        playerId: row.playerId,
        otherPlayerId: row.otherPlayerId,
        oppNumber: row.oppNumber,
        type: row.type as GameEvent['type'],
        deleted: row.deleted,
    };
}

router.get('/assigned', async (req: AuthenticatedRequest, res) => {
    try {
        const rows = await db.select({ game: gameStats, title: events.title, startTime: events.startTime })
            .from(gameStats).innerJoin(events, eq(events.id, gameStats.eventId))
            .where(and(eq(gameStats.scorekeeperUserId, Number(req.user?.id)), ne(gameStats.status, 'finished')))
            .orderBy(asc(events.startTime));
        res.json(rows.map((r) => ({ eventId: r.game.eventId, title: r.title, startTime: toIso(r.startTime), status: r.game.status })));
    } catch (error) {
        console.error('[games/assigned] error:', error);
        res.status(500).json({ error: 'Nu am putut încărca meciurile.' });
    }
});

router.get('/events/:eventId', async (req: AuthenticatedRequest, res) => {
    try {
        const match = await loadMatch(req, res);
        if (!match) return;
        const eventRows = match.game
            ? await db.select().from(gameStatEvents).where(eq(gameStatEvents.gameId, match.game.id)).orderBy(asc(gameStatEvents.seq))
            : [];
        res.json({
            event: { id: match.event.id, title: match.event.title, startTime: toIso(match.event.startTime), location: match.event.location },
            team: { id: match.team.id, name: match.team.name },
            canKeep: match.canKeep,
            canSetup: match.staff,
            game: match.game ? serializeGame(match.game) : null,
            events: eventRows.map(serializeEvent),
            // For the setup screen only.
            lineup: match.staff && (!match.game || match.game.status === 'setup') ? await lineupFor(match.team.id, match.event.id) : [],
        });
    } catch (error) {
        console.error('[games/get] error:', error);
        res.status(500).json({ error: 'Nu am putut încărca meciul.' });
    }
});

router.get('/events/:eventId/keepers', async (req: AuthenticatedRequest, res) => {
    try {
        const match = await loadMatch(req, res);
        if (!match) return;
        if (!match.staff) {
            res.status(403).json({ error: 'Doar staff-ul alege cine ține statistica.' });
            return;
        }
        const playerIds = (await lineupFor(match.team.id, match.event.id)).map((p) => p.playerId);
        const [parents, staff] = await Promise.all([
            playerIds.length
                ? db.selectDistinct({ id: users.id, name: users.name, role: users.role })
                    .from(playerGuardians).innerJoin(users, eq(users.id, playerGuardians.userId))
                    .where(and(inArray(playerGuardians.playerId, playerIds), eq(users.status, 'active')))
                : Promise.resolve([] as { id: number; name: string; role: string }[]),
            db.select({ id: users.id, name: users.name, role: users.role }).from(users)
                .where(and(eq(users.clubId, match.team.clubId!), inArray(users.role, ['coach', 'staff', 'admin']), eq(users.status, 'active'))),
        ]);
        const seen = new Set<number>();
        res.json([...staff, ...parents].filter((u) => !seen.has(u.id) && seen.add(u.id)).map((u) => ({ id: u.id, name: u.name, role: u.role })));
    } catch (error) {
        console.error('[games/keepers] error:', error);
        res.status(500).json({ error: 'Nu am putut încărca lista.' });
    }
});

router.put('/events/:eventId/setup', rateLimit({ bucket: 'games:setup', limit: 60, windowMs: 60_000 }), async (req: AuthenticatedRequest, res) => {
    try {
        const match = await loadMatch(req, res);
        if (!match) return;
        if (!match.staff) {
            res.status(403).json({ error: 'Doar staff-ul poate pregăti meciul.' });
            return;
        }
        if (match.game?.status === 'finished') {
            res.status(409).json({ error: 'Meciul e încheiat.' });
            return;
        }
        const body = (req.body ?? {}) as Record<string, unknown>;
        const mode: GameMode = body.mode === 'full' ? 'full' : 'simple';
        const hasEvents = match.game ? (await db.select({ id: gameStatEvents.id }).from(gameStatEvents).where(eq(gameStatEvents.gameId, match.game.id)).limit(1)).length > 0 : false;
        if (hasEvents && match.game!.mode !== mode) {
            res.status(409).json({ error: 'Modul nu se mai poate schimba după prima acțiune.' });
            return;
        }
        const periodSec = body.periodSec == null ? null : Number(body.periodSec);
        if (periodSec != null && (!Number.isInteger(periodSec) || periodSec < 60 || periodSec > 1200)) {
            res.status(400).json({ error: 'Durata sfertului trebuie să fie între 1 și 20 de minute.' });
            return;
        }
        const opp = parseOpponentRoster(body.opponentRoster);
        if (!opp.ok) {
            res.status(400).json({ error: opp.error });
            return;
        }

        const lineup = await lineupFor(match.team.id, match.event.id);
        const byId = new Map(lineup.map((p) => [p.playerId, p]));
        const rosterIds = Array.isArray(body.roster) ? body.roster.map(Number).filter((id) => byId.has(id)) : [];
        const starters = Array.isArray(body.starters) ? body.starters.map(Number).filter((id) => rosterIds.includes(id)) : [];
        if (rosterIds.length < 5 || rosterIds.length > 15) {
            res.status(400).json({ error: 'Alege între 5 și 15 jucători pentru meci.' });
            return;
        }
        if (starters.length !== 5) {
            res.status(400).json({ error: 'Alege exact 5 jucători care încep.' });
            return;
        }
        const roster = rosterIds.map((id) => {
            const p = byId.get(id)!;
            return { playerId: p.playerId, number: p.number, firstName: p.firstName, lastName: p.lastName };
        });

        let scorekeeperUserId: number | null = null;
        if (body.scorekeeperUserId != null && body.scorekeeperUserId !== '') {
            scorekeeperUserId = Number(body.scorekeeperUserId);
            const [keeper] = await db.select({ id: users.id, clubId: users.clubId }).from(users).where(eq(users.id, scorekeeperUserId)).limit(1);
            if (!keeper || keeper.clubId !== match.team.clubId) {
                res.status(400).json({ error: 'Persoana aleasă nu face parte din club.' });
                return;
            }
        }

        const opponentName = String(body.opponentName ?? '').replace(/\s+/g, ' ').trim().slice(0, 160) || null;
        const values = {
            mode,
            periodSec: mode === 'full' ? periodSec : null,
            opponentName,
            opponentRoster: opp.value,
            roster,
            starters,
            scorekeeperUserId,
            updatedAt: new Date().toISOString(),
        };
        const [saved] = match.game
            ? await db.update(gameStats).set(values).where(eq(gameStats.id, match.game.id)).returning()
            : await db.insert(gameStats).values({ ...values, eventId: match.event.id, teamId: match.team.id, clubId: match.team.clubId!, createdBy: Number(req.user?.id) }).returning();
        res.json(serializeGame(saved));
    } catch (error) {
        console.error('[games/setup] error:', error);
        res.status(500).json({ error: 'Nu am putut salva meciul.' });
    }
});

router.post('/events/:eventId/events', rateLimit({ bucket: 'games:events', limit: 600, windowMs: 60_000 }), async (req: AuthenticatedRequest, res) => {
    try {
        const match = await loadMatch(req, res);
        if (!match) return;
        if (!match.canKeep || !match.game) {
            res.status(match.game ? 403 : 409).json({ error: match.game ? 'Nu ții statistica la acest meci.' : 'Meciul nu e pregătit.' });
            return;
        }
        if (match.game.status === 'finished') {
            res.status(409).json({ error: 'Meciul e încheiat.' });
            return;
        }
        const game = match.game;
        const raw: unknown[] = Array.isArray(req.body?.events) ? req.body.events.slice(0, 500) : [];
        const ctx = {
            mode: game.mode as GameMode,
            playerIds: new Set((game.roster as RosterEntry[]).map((p) => p.playerId)),
            oppNumbers: new Set((game.opponentRoster as { number: string }[]).map((p) => p.number)),
        };
        const parsed: GameEvent[] = [];
        const rejected: { clientId: string; error: string }[] = [];
        for (const item of raw) {
            const result = parseEvent(item, ctx);
            if (result.ok) parsed.push(result.value);
            else rejected.push({ clientId: String((item as { clientId?: unknown })?.clientId ?? ''), error: result.error });
        }

        if (parsed.length) {
            await db.insert(gameStatEvents)
                .values(parsed.map((e) => ({ ...e, gameId: game.id, createdBy: Number(req.user?.id) })))
                .onConflictDoUpdate({
                    target: [gameStatEvents.gameId, gameStatEvents.clientId],
                    // Only "deleted" may change after the fact (undo / redo).
                    set: { deleted: sql`excluded.deleted` },
                });
        }

        const all = (await db.select().from(gameStatEvents).where(eq(gameStatEvents.gameId, game.id))).map(serializeEvent);
        const box = computeBoxScore(all, game.starters as number[], game.periodSec);
        const state = (req.body?.state ?? {}) as { period?: unknown; clockSec?: unknown };
        const period = Number(state.period);
        const clockSec = state.clockSec == null ? null : Number(state.clockSec);
        await db.update(gameStats).set({
            scoreUs: box.us,
            scoreThem: box.them,
            status: game.status === 'setup' ? 'live' : game.status,
            currentPeriod: Number.isInteger(period) && period >= 1 && period <= 10 ? period : game.currentPeriod,
            clockSec: clockSec != null && Number.isInteger(clockSec) && clockSec >= 0 && clockSec <= 3600 ? clockSec : game.clockSec,
            updatedAt: new Date().toISOString(),
        }).where(eq(gameStats.id, game.id));

        res.json({ acked: parsed.map((e) => e.clientId), rejected, scoreUs: box.us, scoreThem: box.them });
    } catch (error) {
        console.error('[games/events] error:', error);
        res.status(500).json({ error: 'Nu am putut salva acțiunile.' });
    }
});

router.post('/events/:eventId/finish', async (req: AuthenticatedRequest, res) => {
    try {
        const match = await loadMatch(req, res);
        if (!match) return;
        if (!match.canKeep || !match.game) {
            res.status(403).json({ error: 'Nu ții statistica la acest meci.' });
            return;
        }
        const [saved] = await db.update(gameStats)
            .set({ status: 'finished', finishedAt: new Date().toISOString(), updatedAt: new Date().toISOString() })
            .where(eq(gameStats.id, match.game.id)).returning();
        res.json(serializeGame(saved));
    } catch (error) {
        console.error('[games/finish] error:', error);
        res.status(500).json({ error: 'Nu am putut încheia meciul.' });
    }
});

export default router;
