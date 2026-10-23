import { Router } from 'express';
import { and, asc, eq, inArray, ne } from 'drizzle-orm';
import { db } from '../db';
import { attendance, clubs, events, l12Documents, playerPayments, players, playersToTeams, teams, users, l12Lineups } from '../db/schema';
import { requireRoles, authenticate, type AuthenticatedRequest } from '../middleware/auth';
import { foldName, generateTeamCode } from '../lib/familyJoin';
import { clubBalances } from '../services/clubFinance';
import { roundMoney } from '../lib/money';
import { attendancePeriod, attendancePeriodInfo, attendanceRate as rateInPeriod, attendanceSummary } from '../lib/attendanceRate';
import { coachReadsTeam } from '../lib/coachScope';
import { toDate } from '../lib/dateUtils';
import { auditRequest } from '../services/auditService';

/** Epoch ms of a DB timestamp (UTC text), 0 when missing — never the process zone. */
const msOf = (value: unknown) => toDate(value)?.getTime() ?? 0;

/**
 * A player's clearance: expired (it had a date, now past) or missing (never
 * entered). Teams used to report one "stale" number and label it "vize
 * expirate", so 1 expired + 4 missing read as "5 vize expirate".
 */
function medicalCheckState(expiry: string | Date | null | undefined, now: number): 'valid' | 'expired' | 'missing' {
    if (!expiry) return 'missing';
    return msOf(expiry) < now ? 'expired' : 'valid';
}

/** Both counts, plus the old total for clients that still read it. */
function medicalCheckTotals(expired: number, missing: number) {
    return { expiredMedicalChecks: expired, missingMedicalChecks: missing, staleMedicalChecks: expired + missing };
}

const router = Router();

router.use(authenticate);

// Every mutation below only checked that the caller was in the same CLUB as
// the team — so a player or parent could rename, deactivate or delete a team,
// reassign its coach, or edit its roster. Only club administrators may.
const requireTeamManager = requireRoles(['admin', 'manager']);

const TEAM_GENDERS = ['M', 'F'] as const;
const TEAM_LEVELS = ['national', 'municipal', 'initiere'] as const;



// The invite code lets families sign up to the team (approval follows), so
// only staff get it — players and parents could otherwise pass it around.
const TEAM_CODE_ROLES = new Set(['admin', 'coach', 'manager', 'superadmin']);

function mapTeam(team: typeof teams.$inferSelect, req?: AuthenticatedRequest) {
    const { inviteCode, ...rest } = team;
    return {
        ...rest,
        ...(req && !TEAM_CODE_ROLES.has(String(req.user?.role ?? '')) ? {} : { inviteCode }),
        createdAt: team.createdAt ?? new Date().toISOString(),
        updatedAt: team.updatedAt ?? team.createdAt ?? new Date().toISOString(),
    };
}

// Per-player data on a whole squad (emails, medical visas, attendance and
// arrears) is for club staff. Players and parents see their own record and a
// teammate list without personal fields through /api/players/me/teams.
function isPlayerFacing(req: AuthenticatedRequest) {
    const role = String(req.user?.role ?? '');
    return role === 'player' || role === 'parent';
}

function getRequestClubId(req: AuthenticatedRequest) {
    return req.user?.clubId == null ? null : Number(req.user.clubId);
}

function isSuperadmin(req: AuthenticatedRequest) {
    return req.user?.role === 'superadmin';
}

async function resolveScopedClubId(req: AuthenticatedRequest, explicitClubId?: unknown) {
    if (!req.user) {
        throw new Error('Authentication is required.');
    }

    const requestClubId = getRequestClubId(req);
    if (requestClubId != null) {
        return requestClubId;
    }

    if (!isSuperadmin(req)) {
        throw new Error('Your account is not assigned to a club.');
    }

    const parsedClubId = explicitClubId == null ? null : Number(explicitClubId);
    if (parsedClubId != null && !Number.isNaN(parsedClubId) && parsedClubId > 0) {
        return parsedClubId;
    }

    throw new Error('A club is required for this action.');
}

/**
 * Same club, and — with `squadData` (per-player emails, medical visas,
 * attendance, arrears) — for a coach, a team they manage (lib/coachScope.ts).
 */
async function ensureTeamAccess(req: AuthenticatedRequest, teamId: number, options: { squadData?: boolean } = {}) {
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

    if (options.squadData && req.user?.role === 'coach' && !coachReadsTeam(team.coachId, req.user?.id)) {
        return { status: 403 as const, error: 'Poți vedea doar jucătorii echipelor pe care le antrenezi.' };
    }

    return { status: 200 as const, team };
}

function mapPlayer(player: typeof players.$inferSelect) {
    return {
        id: player.id,
        firstName: player.firstName ?? 'Unknown',
        lastName: player.lastName ?? 'Player',
        name: player.name ?? `${player.firstName ?? 'Unknown'} ${player.lastName ?? 'Player'}`.trim(),
        email: player.email ?? null,
        number: player.number ?? null,
        status: player.status ?? 'active',
        avatarUrl: player.avatarUrl ?? null,
        teamId: player.teamId ?? null,
        createdAt: player.createdAt ?? null,
        medicalCheckExpiry: player.medicalCheckExpiry ?? null,
        birthYear: player.birthYear ?? null,
    };
}

async function generateInviteCode() {
    for (let attempt = 0; attempt < 5; attempt += 1) {
        const inviteCode = generateTeamCode();
        const existing = await db.select({ id: teams.id }).from(teams).where(eq(teams.inviteCode, inviteCode)).limit(1);
        if (!existing[0]) {
            return inviteCode;
        }
    }

    throw new Error('Failed to generate a unique invite code.');
}

async function getTeamPlayersById(teamId: number) {
    const [directPlayers, relationRows] = await Promise.all([
        db.select().from(players).where(eq(players.teamId, teamId)),
        db
            .select({ player: players })
            .from(playersToTeams)
            .innerJoin(players, eq(playersToTeams.playerId, players.id))
            .where(eq(playersToTeams.teamId, teamId)),
    ]);

    const uniquePlayers = new Map<number, typeof players.$inferSelect>();
    directPlayers.forEach((player) => uniquePlayers.set(player.id, player));
    relationRows.forEach((row) => uniquePlayers.set(row.player.id, row.player));

    return Array.from(uniquePlayers.values()).map(mapPlayer);
}

function parseRouteId(value: string | string[]) {
    const normalized = Array.isArray(value) ? value[0] : value;
    return Number.parseInt(normalized, 10);
}

router.get('/', async (req: AuthenticatedRequest, res) => {
    try {
        if (!req.user) {
            res.status(401).json({ error: 'Authentication is required.' });
            return;
        }

        const rows = isSuperadmin(req)
            ? await db.select().from(teams).orderBy(asc(teams.createdAt))
            : await db
                .select()
                .from(teams)
                .where(eq(teams.clubId, getRequestClubId(req) ?? -1))
                .orderBy(asc(teams.createdAt));

        const teamIds = rows.map((team) => team.id);
        const coachIds = Array.from(new Set(rows.map((team) => team.coachId).filter((id): id is number => id != null)));

        const [directPlayers, relationRows, coachRows] = await Promise.all([
            teamIds.length
                ? db.select({ id: players.id, teamId: players.teamId, medicalCheckExpiry: players.medicalCheckExpiry }).from(players).where(inArray(players.teamId, teamIds))
                : Promise.resolve([]),
            teamIds.length
                ? db
                    .select({ teamId: playersToTeams.teamId, playerId: playersToTeams.playerId, medicalCheckExpiry: players.medicalCheckExpiry })
                    .from(playersToTeams)
                    .innerJoin(players, eq(playersToTeams.playerId, players.id))
                    .where(inArray(playersToTeams.teamId, teamIds))
                : Promise.resolve([]),
            coachIds.length
                ? db.select({ id: users.id, name: users.name, status: users.status }).from(users).where(inArray(users.id, coachIds))
                : Promise.resolve([]),
        ]);

        const coachMap = new Map(coachRows.map((coach) => [coach.id, coach.name]));
        // A coach deactivated while still on a team: the team shows a warning
        // and asks for another coach (WP4B; deactivation now hands teams over).
        const disabledCoachIds = new Set(coachRows.filter((coach) => coach.status === 'disabled').map((coach) => coach.id));
        const now = Date.now();
        const statsByTeam = new Map<number, { playerIds: Set<number>; expired: Set<number>; missing: Set<number> }>();
        const bucketFor = (teamId: number) => {
            let bucket = statsByTeam.get(teamId);
            if (!bucket) {
                bucket = { playerIds: new Set(), expired: new Set(), missing: new Set() };
                statsByTeam.set(teamId, bucket);
            }
            return bucket;
        };

        directPlayers.forEach((player) => {
            if (player.teamId == null) return;
            const bucket = bucketFor(player.teamId);
            bucket.playerIds.add(player.id);
            const state = medicalCheckState(player.medicalCheckExpiry, now);
            if (state !== 'valid') bucket[state].add(player.id);
        });
        relationRows.forEach((row) => {
            const bucket = bucketFor(row.teamId);
            bucket.playerIds.add(row.playerId);
            const state = medicalCheckState(row.medicalCheckExpiry, now);
            if (state !== 'valid') bucket[state].add(row.playerId);
        });

        res.json(rows.map((team) => {
            const stats = statsByTeam.get(team.id);
            return {
                ...mapTeam(team, req),
                coachName: team.coachId != null ? coachMap.get(team.coachId) ?? null : null,
                coachDisabled: team.coachId != null && disabledCoachIds.has(team.coachId),
                playerCount: stats ? stats.playerIds.size : 0,
                ...medicalCheckTotals(stats ? stats.expired.size : 0, stats ? stats.missing.size : 0),
            };
        }));
    } catch (e) {
        console.error('[GET /api/teams] error:', e);
        res.status(500).json({ error: 'Failed to fetch teams' });
    }
});

router.get('/coaches', async (req: AuthenticatedRequest, res) => {
    try {
        if (!req.user) {
            res.status(401).json({ error: 'Authentication is required.' });
            return;
        }

        const rows = isSuperadmin(req)
            ? await db.select({ id: users.id, name: users.name }).from(users).where(and(eq(users.role, 'coach'), ne(users.status, 'disabled'))).orderBy(asc(users.name))
            : await db
                .select({ id: users.id, name: users.name })
                .from(users)
                // A deactivated coach can no longer be given a team.
                .where(and(eq(users.role, 'coach'), ne(users.status, 'disabled'), eq(users.clubId, getRequestClubId(req) ?? -1)))
                .orderBy(asc(users.name));

        res.json(rows);
    } catch (e) {
        console.error('[GET /api/teams/coaches] error:', e);
        res.status(500).json({ error: 'Failed to fetch coaches' });
    }
});

router.post('/', requireTeamManager, async (req: AuthenticatedRequest, res) => {
    try {
        if (!req.user) {
            res.status(401).json({ error: 'Authentication is required.' });
            return;
        }

        const { frbTeamId, name, frbLeagueId, leagueName, frbSeasonId, seasonName, isCustom, gender, level, coachId } = req.body;
        const normalizedName = typeof name === 'string' ? name.trim() : '';
        const normalizedLeagueName = typeof leagueName === 'string' ? leagueName.trim() : '';
        const normalizedSeasonName = typeof seasonName === 'string' ? seasonName.trim() : '';
        const normalizedFrbTeamId = typeof frbTeamId === 'string' ? frbTeamId.trim() : '';
        const normalizedFrbLeagueId = typeof frbLeagueId === 'string' ? frbLeagueId.trim() : '';
        const normalizedFrbSeasonId = typeof frbSeasonId === 'string' ? frbSeasonId.trim() : '';
        const customTeam = isCustom === true;
        const normalizedGender = TEAM_GENDERS.includes(gender) ? gender : null;
        const normalizedLevel = TEAM_LEVELS.includes(level) ? level : null;
        const normalizedCoachId = coachId == null || coachId === '' ? null : Number(coachId);

        if (!normalizedName || !normalizedLeagueName || !normalizedSeasonName) {
            res.status(400).json({ error: 'Missing required fields' });
            return;
        }

        if (!normalizedGender) {
            res.status(400).json({ error: 'Gender is required.' });
            return;
        }

        if (!customTeam && (!normalizedFrbTeamId || !normalizedFrbLeagueId || !normalizedFrbSeasonId)) {
            res.status(400).json({ error: 'Missing FRB identifiers for imported team.' });
            return;
        }

        const clubId = await resolveScopedClubId(req, req.body?.clubId);
        const clubRows = await db.select({ id: clubs.id }).from(clubs).where(eq(clubs.id, clubId)).limit(1);
        if (!clubRows[0]) {
            res.status(400).json({ error: 'Club not found.' });
            return;
        }

        const existingTeam = customTeam
            ? await db
                .select()
                .from(teams)
                .where(and(
                    eq(teams.name, normalizedName),
                    eq(teams.leagueName, normalizedLeagueName),
                    eq(teams.seasonName, normalizedSeasonName),
                    eq(teams.clubId, clubId),
                ))
                .limit(1)
            : await db
                .select()
                .from(teams)
                .where(and(
                    eq(teams.frbTeamId, normalizedFrbTeamId),
                    eq(teams.frbSeasonId, normalizedFrbSeasonId),
                    eq(teams.clubId, clubId),
                ))
                .limit(1);

        if (existingTeam[0]) {
            res.status(409).json({ error: customTeam ? 'This custom team already exists.' : 'This team is already imported for the selected season.' });
            return;
        }

        let coachName: string | null = null;
        if (normalizedCoachId != null) {
            const coachRows = await db.select({ id: users.id, name: users.name }).from(users).where(and(eq(users.id, normalizedCoachId), eq(users.role, 'coach'), ne(users.status, 'disabled'), eq(users.clubId, clubId))).limit(1);
            if (!coachRows[0]) {
                res.status(400).json({ error: 'Selected coach was not found.' });
                return;
            }
            coachName = coachRows[0].name;
        }

        const inviteCode = await generateInviteCode();
        const inserted = await db
            .insert(teams)
            .values({
                frbTeamId: customTeam ? '' : normalizedFrbTeamId,
                name: normalizedName,
                frbLeagueId: customTeam ? '' : normalizedFrbLeagueId,
                leagueName: normalizedLeagueName,
                frbSeasonId: customTeam ? '' : normalizedFrbSeasonId,
                seasonName: normalizedSeasonName,
                inviteCode,
                clubId,
                gender: normalizedGender,
                level: normalizedLevel,
                coachId: normalizedCoachId,
            })
            .returning();

        res.json({ ...mapTeam(inserted[0]), coachName, playerCount: 0, ...medicalCheckTotals(0, 0) });
    } catch (e) {
        console.error('[POST /api/teams] error:', e);
        res.status(500).json({ error: 'Failed to create team' });
    }
});

router.get('/:id', async (req: AuthenticatedRequest, res) => {
    try {
        const id = parseRouteId(req.params.id);
        if (Number.isNaN(id)) {
            res.status(400).json({ error: 'Invalid ID' });
            return;
        }

        const access = await ensureTeamAccess(req, id);
        if (access.status !== 200) {
            res.status(access.status).json({ error: access.error });
            return;
        }

        const [teamPlayers, coachRow] = await Promise.all([
            getTeamPlayersById(id),
            access.team.coachId != null
                ? db.select({ name: users.name, status: users.status }).from(users).where(eq(users.id, access.team.coachId)).limit(1)
                : Promise.resolve([]),
        ]);
        const now = Date.now();
        const medicalChecks = medicalCheckTotals(
            teamPlayers.filter((player) => medicalCheckState(player.medicalCheckExpiry, now) === 'expired').length,
            teamPlayers.filter((player) => medicalCheckState(player.medicalCheckExpiry, now) === 'missing').length,
        );

        res.json({
            ...mapTeam(access.team, req),
            coachName: coachRow[0]?.name ?? null,
            coachDisabled: coachRow[0]?.status === 'disabled',
            playerCount: teamPlayers.length,
            ...medicalChecks,
        });
    } catch (e) {
        console.error(`[GET /api/teams/${req.params.id}] error:`, e);
        res.status(500).json({ error: 'Failed to fetch team details' });
    }
});

router.get('/:id/stats', async (req: AuthenticatedRequest, res) => {
    try {
        if (isPlayerFacing(req)) {
            res.status(403).json({ error: 'Doar staff-ul clubului vede datele întregii echipe.' });
            return;
        }

        const id = parseRouteId(req.params.id);
        if (Number.isNaN(id)) {
            res.status(400).json({ error: 'Invalid ID' });
            return;
        }

        const access = await ensureTeamAccess(req, id, { squadData: true });
        if (access.status !== 200) {
            res.status(access.status).json({ error: access.error });
            return;
        }

        const teamPlayers = await getTeamPlayersById(id);
        const playerIds = teamPlayers.map((p) => p.id);

        // What each player owes: the club's shared fee calculation, so this
        // matches Finanțe and the player's own Plăți page.
        const [attendanceRows, balances] = await Promise.all([
            db.select().from(attendance).where(eq(attendance.teamId, id)),
            playerIds.length && access.team.clubId != null
                ? clubBalances(access.team.clubId, { teamId: id })
                : Promise.resolve([]),
        ]);
        const balanceByPlayer = new Map(balances.map((balance) => [balance.playerId, balance]));

        // The shared period (lib/attendanceRate.ts): the last 30 days, the
        // same rate as the dashboard, Lot and the coach's home.
        const period = attendancePeriod();
        const previousPeriod = attendancePeriod(new Date(), 1);
        const teamRate = rateInPeriod(attendanceRows, period);
        const rowsByPlayer = new Map<number, typeof attendanceRows>();
        for (const row of attendanceRows) {
            rowsByPlayer.set(row.playerId, [...(rowsByPlayer.get(row.playerId) ?? []), row]);
        }

        let playersWithArrears = 0;
        let totalOutstanding = 0;

        const playerStats = teamPlayers.map((player) => {
            const att = rateInPeriod(rowsByPlayer.get(player.id) ?? [], period);

            const balance = balanceByPlayer.get(player.id);
            const outstandingAmount = balance?.outstanding ?? 0;
            // due = overdue (Restanță), pending = owed but not late yet.
            const paymentStatus = !balance ? 'none' : balance.state === 'overdue' ? 'due' : balance.state === 'due' ? 'pending' : 'paid';
            // Arrears (restanțe) = something past due; owing is counted in totalOutstanding.
            if (balance?.state === 'overdue') playersWithArrears += 1;
            totalOutstanding = roundMoney(totalOutstanding + outstandingAmount);

            return {
                playerId: player.id,
                attendanceRate: att.rate,
                present: att.attended,
                total: att.counted,
                // Same value; kept for older clients.
                monthlyRate: att.rate,
                paymentStatus,
                outstandingAmount,
            };
        });

        res.json({
            attendance: teamRate,
            attendancePeriod: attendancePeriodInfo(period),
            // Older names, now the shared 30-day rate (and the 30 days before).
            monthlyAttendanceRate: teamRate.rate,
            previousMonthAttendanceRate: rateInPeriod(attendanceRows, previousPeriod).rate,
            overallAttendanceRate: attendanceSummary(attendanceRows).rate,
            playersWithArrears,
            totalOutstanding,
            players: playerStats,
        });
    } catch (e) {
        console.error(`[GET /api/teams/${req.params.id}/stats] error:`, e);
        res.status(500).json({ error: 'Failed to fetch team stats' });
    }
});

router.delete('/:id', requireTeamManager, async (req: AuthenticatedRequest, res) => {
    try {
        const id = parseRouteId(req.params.id);
        if (Number.isNaN(id)) {
            res.status(400).json({ error: 'Invalid ID' });
            return;
        }

        const access = await ensureTeamAccess(req, id);
        if (access.status !== 200) {
            res.status(access.status).json({ error: access.error });
            return;
        }

        // A team with a history (sessions, attendance, match sheets) is
        // deactivated, not deleted: deleting cascaded through every event,
        // attendance sheet, L12 and live stat of the squad. Only an empty team
        // — typically one created by mistake — can be removed.
        const [eventRow] = await db.select({ id: events.id }).from(events).where(eq(events.teamId, id)).limit(1);
        const [attendanceRow] = eventRow ? [eventRow] : await db.select({ id: attendance.id }).from(attendance).where(eq(attendance.teamId, id)).limit(1);
        if (eventRow || attendanceRow) {
            res.status(409).json({ error: 'Echipa are program și prezențe înregistrate, deci nu poate fi ștearsă. Dezactiveaz-o: istoricul rămâne, iar echipa dispare din listele active.' });
            return;
        }

        await db.transaction(async (tx) => {
            const eventRows = await tx
                .select({ id: events.id })
                .from(events)
                .where(eq(events.teamId, id));
            const eventIds = eventRows.map((event) => event.id);

            await tx.delete(attendance).where(eq(attendance.teamId, id));
            if (eventIds.length > 0) {
                await tx.delete(attendance).where(inArray(attendance.eventId, eventIds));
            }
            await tx.delete(l12Lineups).where(eq(l12Lineups.teamId, id));
            await tx.delete(events).where(eq(events.teamId, id));
            await tx.delete(l12Documents).where(eq(l12Documents.teamId, id));
            await tx.delete(playersToTeams).where(eq(playersToTeams.teamId, id));
            await tx.update(players).set({ teamId: null }).where(eq(players.teamId, id));
            await tx.delete(teams).where(eq(teams.id, id));
        });

        res.json({ success: true });
    } catch (e) {
        console.error(`[DELETE /api/teams/${req.params.id}] error:`, e);
        res.status(500).json({ error: 'Failed to delete team' });
    }
});

router.patch('/:id', requireTeamManager, async (req: AuthenticatedRequest, res) => {
    try {
        const id = parseRouteId(req.params.id);
        if (Number.isNaN(id)) {
            res.status(400).json({ error: 'Invalid ID' });
            return;
        }

        const access = await ensureTeamAccess(req, id);
        if (access.status !== 200) {
            res.status(access.status).json({ error: access.error });
            return;
        }

        const body = req.body ?? {};
        const updates: Partial<typeof teams.$inferInsert> = { updatedAt: new Date().toISOString() };

        if (typeof body.name === 'string' && body.name.trim()) {
            updates.name = body.name.trim();
        }
        if (TEAM_GENDERS.includes(body.gender)) {
            updates.gender = body.gender;
        }
        if (TEAM_LEVELS.includes(body.level)) {
            updates.level = body.level;
        }
        if (typeof body.isActive === 'boolean') {
            updates.isActive = body.isActive;
        }

        // Move an FRB-linked team to another season of the same league. Teams
        // were stuck on the season they were created in — a squad created for
        // 2023–24 could never show a 2026–27 fixture. The FRB team id may change
        // between seasons, so it can be sent along with the season.
        const hasSeasonChange = body.frbSeasonId !== undefined || body.seasonName !== undefined || body.frbTeamId !== undefined;
        if (hasSeasonChange) {
            if (!access.team.frbLeagueId?.trim()) {
                res.status(400).json({ error: 'This team is not linked to an FRB league.' });
                return;
            }
            const text = (value: unknown, max: number) => (typeof value === 'string' && value.trim() && value.trim().length <= max ? value.trim() : null);
            const frbSeasonId = text(body.frbSeasonId, 50);
            const seasonName = text(body.seasonName, 255);
            const frbTeamId = body.frbTeamId === undefined ? undefined : text(body.frbTeamId, 50);
            if (!frbSeasonId || !seasonName || frbTeamId === null) {
                res.status(400).json({ error: 'frbSeasonId and seasonName are required (and frbTeamId, if sent, must be valid).' });
                return;
            }
            updates.frbSeasonId = frbSeasonId;
            updates.seasonName = seasonName;
            if (frbTeamId) updates.frbTeamId = frbTeamId;
        }
        if ('coachId' in body) {
            const nextCoachId = body.coachId == null || body.coachId === '' ? null : Number(body.coachId);
            if (nextCoachId != null) {
                // The coach must be one of this club's coaches.
                const coachRows = await db.select({ id: users.id }).from(users).where(and(
                    eq(users.id, nextCoachId),
                    eq(users.role, 'coach'),
                    ne(users.status, 'disabled'),
                    ...(access.team.clubId != null ? [eq(users.clubId, access.team.clubId)] : []),
                )).limit(1);
                if (!coachRows[0]) {
                    res.status(400).json({ error: 'Selected coach was not found.' });
                    return;
                }
            }
            updates.coachId = nextCoachId;
        }

        const updated = await db.update(teams).set(updates).where(eq(teams.id, id)).returning();
        const [teamPlayers, coachRow] = await Promise.all([
            getTeamPlayersById(id),
            updated[0].coachId != null
                ? db.select({ name: users.name, status: users.status }).from(users).where(eq(users.id, updated[0].coachId)).limit(1)
                : Promise.resolve([]),
        ]);
        const now = Date.now();
        const medicalChecks = medicalCheckTotals(
            teamPlayers.filter((player) => medicalCheckState(player.medicalCheckExpiry, now) === 'expired').length,
            teamPlayers.filter((player) => medicalCheckState(player.medicalCheckExpiry, now) === 'missing').length,
        );

        res.json({
            ...mapTeam(updated[0]),
            coachName: coachRow[0]?.name ?? null,
            coachDisabled: coachRow[0]?.status === 'disabled',
            playerCount: teamPlayers.length,
            ...medicalChecks,
        });
    } catch (e) {
        console.error(`[PATCH /api/teams/${req.params.id}] error:`, e);
        res.status(500).json({ error: 'Failed to update team' });
    }
});

router.get('/:id/players', async (req: AuthenticatedRequest, res) => {
    try {
        if (isPlayerFacing(req)) {
            res.status(403).json({ error: 'Doar staff-ul clubului vede datele întregii echipe.' });
            return;
        }

        const id = parseRouteId(req.params.id);
        if (Number.isNaN(id)) {
            res.status(400).json({ error: 'Invalid ID' });
            return;
        }

        const access = await ensureTeamAccess(req, id, { squadData: true });
        if (access.status !== 200) {
            res.status(access.status).json({ error: access.error });
            return;
        }

        const teamPlayers = await getTeamPlayersById(id);
        res.json(teamPlayers);
    } catch (e) {
        console.error(`[GET /api/teams/${req.params.id}/players] error:`, e);
        res.status(500).json({ error: 'Failed to fetch players' });
    }
});

router.post('/:id/players', requireTeamManager, async (req: AuthenticatedRequest, res) => {
    try {
        const teamId = parseRouteId(req.params.id);
        if (Number.isNaN(teamId)) {
            res.status(400).json({ error: 'Invalid ID' });
            return;
        }

        const access = await ensureTeamAccess(req, teamId);
        if (access.status !== 200) {
            res.status(access.status).json({ error: access.error });
            return;
        }

        const { name, firstName: inputFirstName, lastName: inputLastName, status, avatarUrl } = req.body;

        let firstName = inputFirstName;
        let lastName = inputLastName;
        if (name && (!firstName || !lastName)) {
            const parts = String(name).trim().split(' ');
            firstName = firstName || parts[0];
            lastName = lastName || (parts.length > 1 ? parts.slice(1).join(' ') : 'Player');
        }

        if (!firstName || !lastName) {
            res.status(400).json({ error: 'First name and last name are required' });
            return;
        }

        const insertedPlayers = await db
            .insert(players)
            .values({
                name: name || `${firstName} ${lastName}`,
                firstName,
                lastName,
                status: status || 'active',
                avatarUrl: avatarUrl || null,
                teamId,
            })
            .returning();

        const insertedPlayer = insertedPlayers[0];
        await db.insert(playersToTeams).values({
            playerId: insertedPlayer.id,
            teamId,
        });
        await auditRequest(req, {
            action: 'player.added_to_team',
            entityType: 'player',
            entityId: insertedPlayer.id,
            clubId: access.team.clubId ?? null,
            metadata: { teamId, teamName: access.team.name, created: true },
        });

        res.json(mapPlayer(insertedPlayer));
    } catch (e) {
        console.error(`[POST /api/teams/${req.params.id}/players] error:`, e);
        res.status(500).json({ error: 'Failed to create player' });
    }
});

// Bulk add: the roster pasted as a list ("Popescu Matei 2016", one per line,
// parsed on the client). Club admins, or the coach of this team. Names already
// on the team (same name, and same birth year when both are known) are
// skipped rather than duplicated.
router.post('/:id/players/bulk', async (req: AuthenticatedRequest, res) => {
    try {
        const teamId = parseRouteId(req.params.id);
        if (Number.isNaN(teamId)) {
            res.status(400).json({ error: 'Invalid ID' });
            return;
        }
        const access = await ensureTeamAccess(req, teamId);
        if (access.status !== 200) {
            res.status(access.status).json({ error: access.error });
            return;
        }
        const role = String(req.user?.role ?? '');
        const isTeamCoach = role === 'coach' && access.team.coachId === Number(req.user?.id);
        if (!['admin', 'manager', 'superadmin'].includes(role) && !isTeamCoach) {
            res.status(403).json({ error: 'Doar adminii sau antrenorul echipei pot adăuga jucători.' });
            return;
        }

        const raw: unknown[] = Array.isArray(req.body?.players) ? req.body.players : [];
        if (!raw.length || raw.length > 60) {
            res.status(400).json({ error: 'Trimite între 1 și 60 de jucători.' });
            return;
        }
        const thisYear = new Date().getUTCFullYear();
        const clean = (value: unknown) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, 120);
        const rows = raw.map((entry) => {
            const item = (entry ?? {}) as Record<string, unknown>;
            const year = Number(item.birthYear);
            return {
                firstName: clean(item.firstName),
                lastName: clean(item.lastName),
                birthYear: Number.isInteger(year) && year > thisYear - 40 && year <= thisYear - 3 ? year : null,
            };
        });
        if (rows.some((row) => !row.firstName || !row.lastName)) {
            res.status(400).json({ error: 'Fiecare rând are nevoie de nume și prenume.' });
            return;
        }

        const existing = await getTeamPlayersById(teamId);
        const known = new Set(existing.map((p) => `${foldName(p.firstName)}|${foldName(p.lastName)}`));
        const knownYear = new Map(existing.map((p) => [`${foldName(p.firstName)}|${foldName(p.lastName)}`, p.birthYear ?? null]));
        const toAdd: typeof rows = [];
        const skipped: string[] = [];
        for (const row of rows) {
            const key = `${foldName(row.firstName)}|${foldName(row.lastName)}`;
            const swapped = `${foldName(row.lastName)}|${foldName(row.firstName)}`;
            const hit = known.has(key) ? key : known.has(swapped) ? swapped : null;
            const year = hit ? knownYear.get(hit) : null;
            if (hit && (year == null || row.birthYear == null || year === row.birthYear)) {
                skipped.push(`${row.firstName} ${row.lastName}`);
                continue;
            }
            known.add(key);
            toAdd.push(row);
        }

        const created = toAdd.length
            ? await db.transaction(async (tx) => {
                const inserted = await tx.insert(players).values(toAdd.map((row) => ({
                    name: `${row.firstName} ${row.lastName}`,
                    firstName: row.firstName,
                    lastName: row.lastName,
                    birthYear: row.birthYear,
                    status: 'active',
                    teamId,
                }))).returning();
                await tx.insert(playersToTeams).values(inserted.map((player) => ({ playerId: player.id, teamId })));
                return inserted;
            })
            : [];

        for (const player of created) {
            await auditRequest(req, {
                action: 'player.added_to_team',
                entityType: 'player',
                entityId: player.id,
                clubId: access.team.clubId ?? null,
                metadata: { teamId, teamName: access.team.name, created: true },
            });
        }

        res.status(201).json({ created: created.map(mapPlayer), skipped });
    } catch (e) {
        console.error(`[POST /api/teams/${req.params.id}/players/bulk] error:`, e);
        res.status(500).json({ error: 'Nu am putut adăuga jucătorii.' });
    }
});

router.delete('/:id/players/:playerId', requireTeamManager, async (req: AuthenticatedRequest, res) => {
    try {
        const teamId = parseRouteId(req.params.id);
        const playerId = parseRouteId(req.params.playerId);
        if (Number.isNaN(teamId) || Number.isNaN(playerId)) {
            res.status(400).json({ error: 'Invalid ID' });
            return;
        }

        const access = await ensureTeamAccess(req, teamId);
        if (access.status !== 200) {
            res.status(access.status).json({ error: access.error });
            return;
        }

        await db.transaction(async (tx) => {
            await tx.delete(playersToTeams).where(and(eq(playersToTeams.teamId, teamId), eq(playersToTeams.playerId, playerId)));
            await tx.update(players).set({ teamId: null }).where(and(eq(players.id, playerId), eq(players.teamId, teamId)));
        });
        await auditRequest(req, {
            action: 'player.removed_from_team',
            entityType: 'player',
            entityId: playerId,
            clubId: access.team.clubId ?? null,
            metadata: { teamId, teamName: access.team.name },
        });

        res.json({ success: true });
    } catch (e) {
        console.error(`[DELETE /api/teams/${req.params.id}/players/${req.params.playerId}] error:`, e);
        res.status(500).json({ error: 'Failed to remove player from team' });
    }
});

export default router;
