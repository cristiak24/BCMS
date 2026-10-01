import { Router, type Response } from 'express';
import { and, asc, eq, gte, inArray, isNull } from 'drizzle-orm';
import { authenticate, requireRoles, type AuthenticatedRequest } from '../middleware/auth';
import { db } from '../db';
import { events, l12Lineups, players, playersToTeams, teams, users } from '../db/schema';
import { assertTeamInClub, isSuperadmin, resolveRequestClubId } from '../lib/tenantScope';
import { parseL12Input, type L12Input } from '../lib/l12';
import { toIso } from '../lib/dateUtils';

/**
 * Formular L-12 per match, plus each team's "L12 constant" (template).
 *
 *   GET  /api/l12/overview                → teams + upcoming matches with L12 status
 *   GET  /api/l12/teams/:teamId/template  → the team's constant L12 (or null)
 *   PUT  /api/l12/teams/:teamId/template
 *   GET  /api/l12/events/:eventId         → the match's L12, the team's template, event + team
 *   PUT  /api/l12/events/:eventId
 *   DELETE /api/l12/events/:eventId       → back to "not set" (the template stays)
 *
 * Admins and coaches of the team's club only — the same rule as marking
 * attendance. Player names are always read from the players table, never
 * taken from the request, so a sheet cannot carry a name that is not on the
 * club's books.
 */

const router = Router();
router.use(authenticate, requireRoles(['admin', 'coach']));

type TeamRow = typeof teams.$inferSelect;

async function loadTeamForCaller(req: AuthenticatedRequest, res: Response, teamId: number): Promise<TeamRow | null> {
    if (!Number.isInteger(teamId) || teamId <= 0) {
        res.status(400).json({ error: 'Invalid team id.' });
        return null;
    }
    const rows = await db.select().from(teams).where(eq(teams.id, teamId)).limit(1);
    const scope = assertTeamInClub(rows[0], resolveRequestClubId(req.user), isSuperadmin(req.user));
    if (scope === 'not-found') {
        res.status(404).json({ error: 'Team not found.' });
        return null;
    }
    if (scope !== 'ok') {
        res.status(403).json({ error: 'Forbidden.' });
        return null;
    }
    return rows[0];
}

/** Players any team of this club owns, keyed by id — L12s may borrow from another club team. */
async function loadClubPlayers(clubId: number | null, ids: number[]) {
    if (!ids.length) return new Map<number, typeof players.$inferSelect>();
    const rows = await db.select().from(players).where(inArray(players.id, ids));
    if (clubId == null) return new Map(rows.map((row) => [row.id, row]));

    const clubTeamIds = (await db.select({ id: teams.id }).from(teams).where(eq(teams.clubId, clubId))).map((row) => row.id);
    if (!clubTeamIds.length) return new Map();
    const memberships = await db
        .select({ playerId: playersToTeams.playerId })
        .from(playersToTeams)
        .where(and(inArray(playersToTeams.playerId, ids), inArray(playersToTeams.teamId, clubTeamIds)));
    const viaMembership = new Set(memberships.map((row) => row.playerId));
    const clubTeams = new Set(clubTeamIds);

    return new Map(
        rows
            .filter((row) => viaMembership.has(row.id) || (row.teamId != null && clubTeams.has(row.teamId)))
            .map((row) => [row.id, row]),
    );
}

function serialize(row: typeof l12Lineups.$inferSelect | undefined | null) {
    if (!row) return null;
    return {
        id: row.id,
        teamId: row.teamId,
        eventId: row.eventId,
        competition: row.competition,
        gender: row.gender,
        players: row.players,
        staff: row.staff,
        captainPlayerId: row.captainPlayerId,
        updatedAt: toIso(row.updatedAt),
    };
}

/** Validate the body, resolve player names from the DB, return the row values. */
async function buildValues(req: AuthenticatedRequest, res: Response, team: TeamRow) {
    const parsed = parseL12Input(req.body);
    if (!parsed.ok) {
        res.status(400).json({ error: parsed.error });
        return null;
    }
    const input: L12Input = parsed.data;
    const known = await loadClubPlayers(isSuperadmin(req.user) ? null : team.clubId, input.players.map((p) => p.playerId));
    const missing = input.players.filter((p) => !known.has(p.playerId));
    if (missing.length) {
        res.status(400).json({ error: 'One or more players are not part of this club.' });
        return null;
    }

    return {
        competition: input.competition,
        gender: input.gender,
        captainPlayerId: input.captainPlayerId,
        staff: input.staff,
        players: input.players.map((p) => {
            const row = known.get(p.playerId)!;
            return {
                ...p,
                firstName: row.firstName ?? '',
                lastName: row.lastName ?? row.name ?? '',
            };
        }),
        updatedBy: req.user?.id ?? null,
        updatedAt: new Date().toISOString(),
    };
}

async function getTemplate(teamId: number) {
    const rows = await db.select().from(l12Lineups)
        .where(and(eq(l12Lineups.teamId, teamId), isNull(l12Lineups.eventId)))
        .limit(1);
    return rows[0] ?? null;
}

router.get('/overview', async (req: AuthenticatedRequest, res) => {
    try {
        const clubId = resolveRequestClubId(req.user);
        const superadmin = isSuperadmin(req.user);
        if (!superadmin && clubId == null) {
            res.json({ teams: [], matches: [] });
            return;
        }

        const teamRows = await (superadmin
            ? db.select().from(teams).orderBy(asc(teams.name))
            : db.select().from(teams).where(eq(teams.clubId, clubId!)).orderBy(asc(teams.name)));
        const teamIds = teamRows.map((team) => team.id);
        if (!teamIds.length) {
            res.json({ teams: [], matches: [] });
            return;
        }

        const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
        const [lineups, matchRows] = await Promise.all([
            db.select({ teamId: l12Lineups.teamId, eventId: l12Lineups.eventId, players: l12Lineups.players, updatedAt: l12Lineups.updatedAt })
                .from(l12Lineups)
                .where(inArray(l12Lineups.teamId, teamIds)),
            db.select().from(events)
                .where(and(inArray(events.teamId, teamIds), eq(events.type, 'match'), gte(events.startTime, since)))
                .orderBy(asc(events.startTime))
                .limit(40),
        ]);

        const coachIds = Array.from(new Set(teamRows.map((t) => t.coachId).filter((id): id is number => id != null)));
        const coaches = coachIds.length
            ? await db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, coachIds))
            : [];
        const coachName = new Map(coaches.map((c) => [c.id, c.name]));

        const templates = new Map(lineups.filter((l) => l.eventId == null).map((l) => [l.teamId, l]));
        const byEvent = new Map(lineups.filter((l) => l.eventId != null).map((l) => [l.eventId!, l]));
        const teamName = new Map(teamRows.map((t) => [t.id, t.name]));

        res.json({
            teams: teamRows.map((team) => {
                const template = templates.get(team.id);
                return {
                    id: team.id,
                    name: team.name,
                    leagueName: team.leagueName,
                    coachName: team.coachId != null ? coachName.get(team.coachId) ?? null : null,
                    hasTemplate: Boolean(template),
                    templatePlayerCount: Array.isArray(template?.players) ? template!.players.length : 0,
                    templateUpdatedAt: template ? toIso(template.updatedAt) : null,
                };
            }),
            matches: matchRows.map((event) => {
                const lineup = byEvent.get(event.id);
                return {
                    eventId: event.id,
                    title: event.title,
                    startTime: toIso(event.startTime),
                    location: event.location,
                    teamId: event.teamId,
                    teamName: event.teamId != null ? teamName.get(event.teamId) ?? null : null,
                    hasLineup: Boolean(lineup),
                    playerCount: Array.isArray(lineup?.players) ? lineup!.players.length : 0,
                };
            }),
        });
    } catch (error) {
        console.error('[l12/overview] error:', error);
        res.status(500).json({ error: 'Failed to load L12 overview.' });
    }
});

router.get('/teams/:teamId/template', async (req: AuthenticatedRequest, res) => {
    try {
        const team = await loadTeamForCaller(req, res, Number(req.params.teamId));
        if (!team) return;
        res.json({ team: { id: team.id, name: team.name, leagueName: team.leagueName, seasonName: team.seasonName, gender: team.gender }, template: serialize(await getTemplate(team.id)) });
    } catch (error) {
        console.error('[l12/template:get] error:', error);
        res.status(500).json({ error: 'Failed to load the L12 template.' });
    }
});

router.put('/teams/:teamId/template', async (req: AuthenticatedRequest, res) => {
    try {
        const team = await loadTeamForCaller(req, res, Number(req.params.teamId));
        if (!team) return;
        const values = await buildValues(req, res, team);
        if (!values) return;

        const existing = await getTemplate(team.id);
        const [saved] = existing
            ? await db.update(l12Lineups).set(values).where(eq(l12Lineups.id, existing.id)).returning()
            : await db.insert(l12Lineups).values({ ...values, teamId: team.id, eventId: null }).returning();
        res.json(serialize(saved));
    } catch (error) {
        console.error('[l12/template:put] error:', error);
        res.status(500).json({ error: 'Failed to save the L12 template.' });
    }
});

async function loadMatchForCaller(req: AuthenticatedRequest, res: Response) {
    const eventId = Number(req.params.eventId);
    if (!Number.isInteger(eventId) || eventId <= 0) {
        res.status(400).json({ error: 'Invalid event id.' });
        return null;
    }
    const rows = await db.select().from(events).where(eq(events.id, eventId)).limit(1);
    const event = rows[0];
    if (!event) {
        res.status(404).json({ error: 'Event not found.' });
        return null;
    }
    if (event.teamId == null) {
        res.status(400).json({ error: 'This event is not linked to a team.' });
        return null;
    }
    const team = await loadTeamForCaller(req, res, event.teamId);
    if (!team) return null;
    return { event, team };
}

router.get('/events/:eventId', async (req: AuthenticatedRequest, res) => {
    try {
        const match = await loadMatchForCaller(req, res);
        if (!match) return;
        const { event, team } = match;
        const [lineupRows, template] = await Promise.all([
            db.select().from(l12Lineups).where(eq(l12Lineups.eventId, event.id)).limit(1),
            getTemplate(team.id),
        ]);
        res.json({
            event: { id: event.id, title: event.title, type: event.type, startTime: toIso(event.startTime), endTime: toIso(event.endTime), location: event.location },
            team: { id: team.id, name: team.name, leagueName: team.leagueName, seasonName: team.seasonName, gender: team.gender },
            lineup: serialize(lineupRows[0]),
            template: serialize(template),
        });
    } catch (error) {
        console.error('[l12/event:get] error:', error);
        res.status(500).json({ error: 'Failed to load the L12.' });
    }
});

router.put('/events/:eventId', async (req: AuthenticatedRequest, res) => {
    try {
        const match = await loadMatchForCaller(req, res);
        if (!match) return;
        const values = await buildValues(req, res, match.team);
        if (!values) return;

        // event_id is unique, so an upsert keeps two quick saves from racing into two rows.
        const [saved] = await db.insert(l12Lineups)
            .values({ ...values, teamId: match.team.id, eventId: match.event.id })
            .onConflictDoUpdate({ target: l12Lineups.eventId, set: values })
            .returning();
        res.json(serialize(saved));
    } catch (error) {
        console.error('[l12/event:put] error:', error);
        res.status(500).json({ error: 'Failed to save the L12.' });
    }
});

router.delete('/events/:eventId', async (req: AuthenticatedRequest, res) => {
    try {
        const match = await loadMatchForCaller(req, res);
        if (!match) return;
        await db.delete(l12Lineups).where(eq(l12Lineups.eventId, match.event.id));
        res.status(204).end();
    } catch (error) {
        console.error('[l12/event:delete] error:', error);
        res.status(500).json({ error: 'Failed to reset the L12.' });
    }
});

export default router;
