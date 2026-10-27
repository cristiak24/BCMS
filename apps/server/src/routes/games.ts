import { Router, type Response } from 'express';
import { and, asc, eq, inArray, ne, sql } from 'drizzle-orm';
import { authenticate, type AuthenticatedRequest } from '../middleware/auth';
import { rateLimit } from '../middleware/rateLimit';
import { db } from '../db';
import { events, gameStatEvents, gameStats, l12Lineups, playerGuardians, players, playersToTeams, teams, users } from '../db/schema';
import { computeBoxScore, emptyLine, parseEvent, parseOpponentRoster, type GameEvent, type GameMode } from '../lib/gameStats';
import { toDate, toIso } from '../lib/dateUtils';
import { seasonBounds, seasonTotals } from '../lib/seasonStats';
import { resolveSelfPlayerForRequest, teamIdsOfPlayers } from '../lib/selfPlayer';
import { coachManagesEvent } from '../lib/coachScope';
import { auditRequest } from '../services/auditService';

/**
 * Live match statistics.
 *
 *   GET  /api/games/assigned              → open games the caller was asked to keep
 *   GET  /api/games/events/:eventId       → game + events (any club member may read)
 *   GET  /api/games/events/:eventId/keepers → who can be asked to keep stats
 *   PUT  /api/games/events/:eventId/setup → mode, roster, starters, opponent, scorekeeper
 *   POST /api/games/events/:eventId/events → append/undo events (idempotent by clientId)
 *   POST /api/games/events/:eventId/finish
 *   POST /api/games/events/:eventId/reopen → club admin only: a finished match back to live
 *   GET  /api/games/season/players/:playerId → a player's season averages/totals + last matches
 *   GET  /api/games/season/teams/:teamId    → every player of a team, season totals
 *
 * Keeping stats: club admins and staff, the coach of the match's team, or the
 * person a coach delegated for that match (often a parent). Setup: the same
 * minus the delegate.
 */

const router = Router();
router.use(authenticate);

const STAFF_ROLES = new Set(['admin', 'coach', 'staff', 'superadmin']);

type RosterEntry = { playerId: number; number: string; firstName: string; lastName: string };
type LineupEntry = RosterEntry & { onL12: boolean; visaExpired: boolean };

/** The Romanian calendar day of a timestamp (visas end on a day, not an instant). */
function bucharestDay(value: Date | string) {
    // DB timestamps are UTC text without a zone („2026-10-22 00:00:00”): toDate reads them as UTC.
    const date = toDate(value);
    if (!date) return null;
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Bucharest', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}

/** Expired = its last day is before today, the rule Acasă and L12 use (client utils/medicalVisa). */
function visaExpired(expiry: Date | string | null | undefined, now = new Date()) {
    if (!expiry) return false;
    const day = bucharestDay(expiry);
    const today = bucharestDay(now);
    return day != null && today != null && day < today;
}

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
    const isScorekeeper = game != null && game.scorekeeperUserId === Number(req.user?.id);

    // A player/parent not (yet) linked to this match's team must not read
    // another team's live score/box score either. The delegated scorekeeper is
    // let in by the delegation itself, not by which child a parent has
    // selected: with a sibling from another team selected, the match was
    // "not found" for the very person asked to keep it.
    const role = String(req.user?.role ?? '');
    if (!isSuper && !isScorekeeper && (role === 'player' || role === 'parent')) {
        const selfPlayer = await resolveSelfPlayerForRequest(req);
        const selfTeamIds = selfPlayer ? await teamIdsOfPlayers([selfPlayer.id]) : [];
        if (!selfTeamIds.includes(row.team.id)) {
            res.status(404).json({ error: 'Meciul nu există.' });
            return null;
        }
    }

    // A coach sets up and keeps only the matches of teams they coach (or the
    // match they are assigned to), the same rule as events and attendance.
    const staff = STAFF_ROLES.has(role) && (role !== 'coach' || coachManagesEvent(row.team.coachId, row.event.coachId, req.user?.id));
    const canKeep = staff || isScorekeeper;
    return { event: row.event, team: row.team, game: game ?? null, staff, canKeep };
}

/**
 * Who can play this match: the players on its L12 when one is saved (the
 * official list — the scorer used to offer the whole team), otherwise the
 * team's active players. Numbered from the L12.
 */
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
        .filter((p) => (l12.size > 0 ? l12.has(p.id) : (p.status ?? 'active') !== 'inactive'))
        .map((p) => ({
            playerId: p.id,
            number: l12.get(p.id) || (p.number != null ? String(p.number) : ''),
            firstName: p.firstName ?? '',
            lastName: p.lastName ?? p.name ?? '',
            onL12: l12.has(p.id),
            visaExpired: visaExpired(p.medicalCheckExpiry),
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
        // A signed-in account with no profile row has no id: Number(undefined)
        // went into the SQL as NaN and answered 500.
        const userId = Number(req.user?.id);
        if (!Number.isInteger(userId) || userId <= 0) {
            res.json([]);
            return;
        }
        const rows = await db.select({ game: gameStats, title: events.title, startTime: events.startTime })
            .from(gameStats).innerJoin(events, eq(events.id, gameStats.eventId))
            .where(and(eq(gameStats.scorekeeperUserId, userId), ne(gameStats.status, 'finished')))
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
            event: { id: match.event.id, title: match.event.title, startTime: toIso(match.event.startTime), location: match.event.location, opponent: match.event.opponent ?? null },
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
        const expiredStarters = starters.map((id) => byId.get(id)!).filter((p) => p.visaExpired);
        if (expiredStarters.length) {
            const names = expiredStarters.map((p) => `${p.firstName} ${p.lastName}`.trim()).join(', ');
            res.status(400).json({ error: `Cu viza expirată nu se poate începe meciul: ${names}.` });
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
        // The opponent typed here fills the match's own field when it is still
        // empty, so the L12 sheet names the same side (events.opponent).
        if (opponentName && !match.event.opponent) {
            await db.update(events).set({ opponent: opponentName }).where(eq(events.id, match.event.id));
        }
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
        // The final score is what Acasă shows as the result: derive it from
        // the stored actions once more rather than trusting the last snapshot.
        const box = await recomputeScore(match.game);
        const [saved] = await db.update(gameStats)
            .set({ status: 'finished', scoreUs: box.us, scoreThem: box.them, finishedAt: new Date().toISOString(), updatedAt: new Date().toISOString() })
            .where(eq(gameStats.id, match.game.id)).returning();
        if (match.game.status !== 'finished') {
            await auditRequest(req, {
                action: 'game.finished',
                entityType: 'event',
                entityId: match.event.id,
                clubId: match.team.clubId,
                metadata: { title: match.event.title, teamName: match.team.name, scoreUs: box.us, scoreThem: box.them },
            });
        }
        res.json(serializeGame(saved));
    } catch (error) {
        console.error('[games/finish] error:', error);
        res.status(500).json({ error: 'Nu am putut încheia meciul.' });
    }
});

/**
 * A wrong action found after "Final" (audit WP7-C2): a club admin reopens the
 * match, the sheet is corrected through the scorer and finished again. The
 * score is re-derived from the stored actions, as at finish, and both steps
 * are audited.
 */
router.post('/events/:eventId/reopen', async (req: AuthenticatedRequest, res) => {
    try {
        const match = await loadMatch(req, res);
        if (!match) return;
        const role = String(req.user?.role ?? '');
        if (role !== 'admin' && role !== 'superadmin') {
            res.status(403).json({ error: 'Doar un administrator al clubului poate redeschide meciul.' });
            return;
        }
        if (!match.game || match.game.status !== 'finished') {
            res.status(409).json({ error: 'Meciul nu e încheiat.' });
            return;
        }
        const box = await recomputeScore(match.game);
        const [saved] = await db.update(gameStats)
            .set({ status: 'live', scoreUs: box.us, scoreThem: box.them, finishedAt: null, updatedAt: new Date().toISOString() })
            .where(eq(gameStats.id, match.game.id)).returning();
        await auditRequest(req, {
            action: 'game.reopened',
            entityType: 'event',
            entityId: match.event.id,
            clubId: match.team.clubId,
            metadata: { title: match.event.title, teamName: match.team.name, scoreUs: match.game.scoreUs, scoreThem: match.game.scoreThem },
        });
        res.json(serializeGame(saved));
    } catch (error) {
        console.error('[games/reopen] error:', error);
        res.status(500).json({ error: 'Nu am putut redeschide meciul.' });
    }
});

/**
 * Season statistics read like box scores do: any member of the club, while a
 * player or parent only sees the teams of their own (selected) child.
 */
async function seasonScope(req: AuthenticatedRequest, res: Response, teamIds: number[], clubIdOfTarget: number | null) {
    const isSuper = req.user?.role === 'superadmin';
    if (clubIdOfTarget == null || (!isSuper && clubIdOfTarget !== clubIdOf(req))) {
        res.status(404).json({ error: 'Nu am găsit statisticile.' });
        return false;
    }
    const role = String(req.user?.role ?? '');
    if (!isSuper && (role === 'player' || role === 'parent')) {
        const self = await resolveSelfPlayerForRequest(req);
        const own = new Set(self ? await teamIdsOfPlayers([self.id]) : []);
        if (!teamIds.some((id) => own.has(id))) {
            res.status(404).json({ error: 'Nu am găsit statisticile.' });
            return false;
        }
    }
    return true;
}

function seasonFrom(req: AuthenticatedRequest) {
    const year = Number(req.query.season);
    // ?season=2025 → 2025–26; default: the season today falls in.
    return Number.isInteger(year) && year >= 2000 && year <= 2100 ? seasonBounds(new Date(Date.UTC(year, 9, 1))) : seasonBounds();
}

/** The club's finished matches of a season with each one's box score, oldest first. */
async function finishedGamesOfSeason(clubId: number, bounds: ReturnType<typeof seasonBounds>, teamId?: number) {
    const rows = await db.select({ game: gameStats, title: events.title, startTime: events.startTime, opponent: events.opponent })
        .from(gameStats).innerJoin(events, eq(events.id, gameStats.eventId))
        .where(and(eq(gameStats.clubId, clubId), eq(gameStats.status, 'finished'), ...(teamId != null ? [eq(gameStats.teamId, teamId)] : [])))
        .orderBy(asc(events.startTime));
    const inSeason = rows.filter((row) => {
        const at = toDate(row.startTime)?.getTime();
        return at != null && at >= bounds.start.getTime() && at < bounds.end.getTime();
    });
    if (!inSeason.length) return [];
    const actions = await db.select().from(gameStatEvents).where(inArray(gameStatEvents.gameId, inSeason.map((row) => row.game.id)));
    const byGame = new Map<number, GameEvent[]>();
    for (const action of actions) byGame.set(action.gameId, [...(byGame.get(action.gameId) ?? []), serializeEvent(action)]);
    return inSeason.map((row) => ({
        ...row,
        box: computeBoxScore(byGame.get(row.game.id) ?? [], row.game.starters as number[], row.game.periodSec),
        rosterIds: new Set((row.game.roster as RosterEntry[]).map((p) => p.playerId)),
    }));
}

router.get('/season/players/:playerId', async (req: AuthenticatedRequest, res) => {
    try {
        const playerId = Number(req.params.playerId);
        if (!Number.isInteger(playerId) || playerId <= 0) {
            res.status(400).json({ error: 'Jucător invalid.' });
            return;
        }
        const teamIds = await teamIdsOfPlayers([playerId]);
        const clubRows = teamIds.length ? await db.select({ clubId: teams.clubId }).from(teams).where(inArray(teams.id, teamIds)) : [];
        const own = clubRows.find((row) => row.clubId === clubIdOf(req))?.clubId ?? clubRows[0]?.clubId ?? null;
        if (!await seasonScope(req, res, teamIds, own)) return;

        const bounds = seasonFrom(req);
        // Every match the player was on the sheet for — wherever their team is now.
        const games = (await finishedGamesOfSeason(own!, bounds)).filter((g) => g.rosterIds.has(playerId));
        const lines = games.map((g) => ({ mode: g.game.mode as GameMode, line: g.box.players[playerId] ?? emptyLine() }));
        res.json({
            season: { label: bounds.label, startYear: bounds.startYear },
            ...seasonTotals(lines),
            recent: games.map((g, i) => ({ g, line: lines[i].line })).slice(-5).reverse().map(({ g, line }) => ({
                eventId: g.game.eventId,
                title: g.title,
                startTime: toIso(g.startTime),
                opponentName: g.game.opponentName ?? g.opponent ?? null,
                mode: g.game.mode,
                scoreUs: g.game.scoreUs,
                scoreThem: g.game.scoreThem,
                pts: line.pts,
                reb: g.game.mode === 'full' ? line.rebO + line.rebD : null,
                ast: g.game.mode === 'full' ? line.ast : null,
                pf: line.pf,
                minutes: line.secondsPlayed != null ? Math.round(line.secondsPlayed / 60) : null,
            })),
        });
    } catch (error) {
        console.error('[games/season/player] error:', error);
        res.status(500).json({ error: 'Nu am putut încărca statisticile sezonului.' });
    }
});

router.get('/season/teams/:teamId', async (req: AuthenticatedRequest, res) => {
    try {
        const teamId = Number(req.params.teamId);
        if (!Number.isInteger(teamId) || teamId <= 0) {
            res.status(400).json({ error: 'Echipă invalidă.' });
            return;
        }
        const [team] = await db.select({ id: teams.id, clubId: teams.clubId }).from(teams).where(eq(teams.id, teamId)).limit(1);
        if (!team) {
            res.status(404).json({ error: 'Nu am găsit statisticile.' });
            return;
        }
        if (!await seasonScope(req, res, [teamId], team.clubId)) return;

        const bounds = seasonFrom(req);
        const games = await finishedGamesOfSeason(team.clubId!, bounds, teamId);
        // Everyone who played for this team this season, by their latest sheet entry.
        const people = new Map<number, RosterEntry>();
        for (const g of games) for (const p of g.game.roster as RosterEntry[]) people.set(p.playerId, p);
        const rows = Array.from(people.values()).map((p) => {
            const lines = games.filter((g) => g.rosterIds.has(p.playerId))
                .map((g) => ({ mode: g.game.mode as GameMode, line: g.box.players[p.playerId] ?? emptyLine() }));
            return { playerId: p.playerId, firstName: p.firstName, lastName: p.lastName, number: p.number, ...seasonTotals(lines) };
        });
        res.json({ season: { label: bounds.label, startYear: bounds.startYear }, games: games.length, players: rows });
    } catch (error) {
        console.error('[games/season/team] error:', error);
        res.status(500).json({ error: 'Nu am putut încărca statisticile sezonului.' });
    }
});

/** The score from the stored actions — the source of truth, not the last snapshot. */
async function recomputeScore(game: typeof gameStats.$inferSelect) {
    const all = (await db.select().from(gameStatEvents).where(eq(gameStatEvents.gameId, game.id))).map(serializeEvent);
    return computeBoxScore(all, game.starters as number[], game.periodSec);
}

export default router;
