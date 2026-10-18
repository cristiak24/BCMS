import { Request, Response } from 'express';
import { db } from '../db';
import { players, teams, playersToTeams, attendance, playerPayments, users, events, playerGuardians } from '../db/schema';
import { and, desc, eq, gte, inArray, isNull, lte, notExists, or, sql } from 'drizzle-orm';
import { AuthenticatedRequest } from '../middleware/auth';
import { ensureClubPlayerRecords } from '../lib/clubPlayerRecords';
import { buildPlayerUpdate } from '../lib/playerUpdate';
import { toDate, toIso } from '../lib/dateUtils';
import { resolveSelfPlayerForRequest } from '../lib/selfPlayer';
import { isFailedStatus, isOutstandingStatus, isPaidStatus } from '../lib/paymentLedger';
import { coachSeesPlayer, teamsManagedByCoach } from '../lib/coachScope';
import { attendanceSummary, attendanceSummaryFromCounts } from '../lib/attendanceRate';
import { clubBalances, playerFees } from '../services/clubFinance';
import { listPlayerHistory, writeAuditLog } from '../services/auditService';
import { sendPaymentReminders as sendReminderNotifications } from '../lib/notifications';
import { applyRosterQuery, parseRosterQuery } from '../lib/rosterQuery';

const DEFAULT_PAYMENT_CURRENCY = (process.env.STRIPE_CURRENCY || 'ron').trim().toLowerCase();

function isSuperadmin(req: AuthenticatedRequest) {
    return req.user?.role === 'superadmin';
}

// Player/parent sessions must only ever see their own team's roster, and only
// the fields that make sense for a teammate list (no payment/medical/contact
// data belonging to someone else). Every other authenticated role keeps the
// existing club-wide, full-detail roster behaviour.
function isPlayerFacingRole(req: AuthenticatedRequest) {
    const role = req.user?.role;
    return role === 'player' || role === 'parent';
}

// Denylist (not allowlist) so the stripped row keeps the exact same shape as
// the full row — that matters for TypeScript (buildRosterRows stays a single
// consistent return type instead of widening to `unknown` for every caller)
// and for any downstream code that reads a field it doesn't recognize as safe.
// Keep this in sync with every personal column on `players` — a new contact
// column missing here is sent to the whole team.
const SENSITIVE_ROSTER_FIELDS = [
    'email', 'medicalCheckExpiry', 'attendanceRate', 'paymentStatus',
    'phone', 'guardianName', 'guardianPhone', 'guardian2Name', 'guardian2Phone',
] as const;

function toSafeRosterRow<T extends Record<string, unknown>>(row: T): T {
    const safe = { ...row };
    for (const key of SENSITIVE_ROSTER_FIELDS) {
        if (key in safe) (safe as Record<string, unknown>)[key] = null;
    }
    return safe;
}

// For a parent this is their selected child (lib/selfPlayer.ts).
async function getSelfPlayerRecord(req: AuthenticatedRequest) {
    return resolveSelfPlayerForRequest(req);
}

// A player belongs to a team either through the join table or through the
// legacy players.team_id column, so both have to be unioned everywhere.
async function getTeamIdsForPlayer(playerId: number, directTeamId: number | null): Promise<number[]> {
    const membershipRows = await db.select({ teamId: playersToTeams.teamId }).from(playersToTeams).where(eq(playersToTeams.playerId, playerId));
    const ids = new Set(membershipRows.map(m => m.teamId));
    if (directTeamId != null) ids.add(directTeamId);
    return Array.from(ids);
}

async function getSelfTeamIds(req: AuthenticatedRequest): Promise<number[]> {
    const self = await getSelfPlayerRecord(req);
    if (!self) return [];
    return getTeamIdsForPlayer(self.id, self.teamId ?? null);
}

function getRequestClubId(req: AuthenticatedRequest) {
    return req.user?.clubId == null ? null : Number(req.user.clubId);
}


async function getAllowedTeamIds(req: AuthenticatedRequest) {
    if (isSuperadmin(req)) return null; 
    const clubId = getRequestClubId(req);
    if (clubId == null) return [];
    const clubTeams = await db.select({ id: teams.id }).from(teams).where(eq(teams.clubId, clubId));
    return clubTeams.map(t => t.id);
}

/**
 * For a coach: may they change this player? Only when the player is on a team
 * they manage (lib/coachScope.ts) — or on no team at all yet. Other roles: true.
 */
async function coachMayEditPlayer(req: AuthenticatedRequest, playerId: number, directTeamId: number | null) {
    if (req.user?.role !== 'coach') return true;
    const clubId = getRequestClubId(req);
    if (clubId == null) return false;
    const playerTeamIds = await getTeamIdsForPlayer(playerId, directTeamId);
    if (!playerTeamIds.length) return true;
    const clubTeams = await db.select({ id: teams.id, coachId: teams.coachId }).from(teams).where(eq(teams.clubId, clubId));
    const managed = new Set(teamsManagedByCoach(clubTeams, req.user?.id));
    return playerTeamIds.some((teamId) => managed.has(teamId));
}

async function coachMayUseTeam(req: AuthenticatedRequest, teamId: number) {
    if (req.user?.role !== 'coach') return true;
    const rows = await db.select({ id: teams.id, coachId: teams.coachId }).from(teams).where(eq(teams.id, teamId)).limit(1);
    return teamsManagedByCoach(rows, req.user?.id).includes(teamId);
}

const COACH_SCOPE_ERROR = 'Poți modifica doar jucătorii echipelor pe care le antrenezi.';
const COACH_READ_ERROR = 'Poți vedea doar jucătorii echipelor pe care le antrenezi.';

/** For a coach, the club teams they manage (lib/coachScope.ts); null for every other role. */
async function coachManagedTeamIds(req: AuthenticatedRequest): Promise<number[] | null> {
    if (req.user?.role !== 'coach') return null;
    const clubId = getRequestClubId(req);
    if (clubId == null) return [];
    const clubTeams = await db.select({ id: teams.id, coachId: teams.coachId }).from(teams).where(eq(teams.clubId, clubId));
    return teamsManagedByCoach(clubTeams, req.user?.id);
}

/** SQL twin of coachSeesPlayer: on a managed team, or on no team at all. */
function coachVisiblePlayers(managedTeamIds: number[]) {
    const onNoTeam = and(
        isNull(players.teamId),
        notExists(db.select({ id: playersToTeams.id }).from(playersToTeams).where(eq(playersToTeams.playerId, players.id))),
    );
    if (!managedTeamIds.length) return onNoTeam;
    return or(
        inArray(players.teamId, managedTeamIds),
        inArray(players.id, db.select({ id: playersToTeams.playerId }).from(playersToTeams).where(inArray(playersToTeams.teamId, managedTeamIds))),
        onNoTeam,
    );
}

/** One entry in the player's history (Jurnal + the player page). */
function auditPlayer(req: AuthenticatedRequest, action: string, playerId: number, metadata: Record<string, unknown>) {
    return writeAuditLog({
        action,
        entityType: 'player',
        entityId: playerId,
        actorUserId: req.user?.id ?? null,
        actorUid: req.firebaseUser?.uid ?? null,
        actorRole: req.user?.role ?? null,
        clubId: getRequestClubId(req),
        metadata,
    });
}

const HISTORY_FIELDS = ['firstName', 'lastName', 'name', 'status', 'number', 'birthYear', 'medicalCheckExpiry', 'avatarUrl'] as const;

async function getPlayerClubIdByEmail(email?: string | null) {
    if (!email) return null;
    const userRows = await db
        .select({ clubId: users.clubId })
        .from(users)
        .where(eq(users.email, email.trim().toLowerCase()))
        .limit(1);
    return userRows[0]?.clubId == null ? null : Number(userRows[0].clubId);
}

async function isPlayerAllowedForRequest(req: AuthenticatedRequest, player: typeof players.$inferSelect) {
    const allowedTeamIds = await getAllowedTeamIds(req);
    if (allowedTeamIds === null) return true;

    const managed = await coachManagedTeamIds(req);
    if (managed !== null && !coachSeesPlayer(await getTeamIdsForPlayer(player.id, player.teamId ?? null), managed)) return false;

    const allowedSet = new Set(allowedTeamIds);
    const membershipRows = await db.select().from(playersToTeams).where(eq(playersToTeams.playerId, player.id));
    const isAssignedToAllowedTeam = Boolean(player.teamId && allowedSet.has(player.teamId)) || membershipRows.some(m => allowedSet.has(m.teamId));
    if (isAssignedToAllowedTeam) return true;

    const requestClubId = getRequestClubId(req);
    const playerClubId = await getPlayerClubIdByEmail(player.email);
    return requestClubId != null && playerClubId === requestClubId;
}

function monthName(month?: number | null, year?: number | null) {
    if (!month || !year) return 'Cotizație';
    return `Cotizație ${new Intl.DateTimeFormat('ro-RO', { month: 'long', year: 'numeric' }).format(new Date(year, month - 1, 1))}`;
}

function getPaymentDate(value?: string | null) {
    return value ? new Date(value).toISOString() : new Date().toISOString();
}

/** Roster/payment-pill wording for a balance state (see services/clubFinance.ts). */
function paymentStatusFromState(state: 'overdue' | 'due' | 'paid') {
    return state === 'paid' ? 'paid' : state === 'overdue' ? 'overdue' : 'pending';
}

async function buildPlayerPaymentSummary(player: typeof players.$inferSelect, clubId: number | null) {
    // What is owed comes from the same fee calculation as the player's Plăți
    // page and the club's balances, not from summing "unpaid" rows.
    const { totals, rows: paymentRows } = await playerFees(player, clubId);
    const paidRows = paymentRows.filter(row => isPaidStatus(row.status));
    const paidAmount = paidRows.reduce((sum, row) => sum + Number(row.amount ?? 0), 0);
    const outstandingAmount = totals.outstanding;

    return {
        paymentStatus: paymentStatusFromState(totals.state),
        overdueAmount: totals.overdue,
        paidAmount,
        outstandingAmount,
        amountDue: outstandingAmount,
        paymentCurrency: DEFAULT_PAYMENT_CURRENCY,
        paymentTransactions: paymentRows
            .filter(row => isPaidStatus(row.status) || isFailedStatus(row.status))
            .sort((a, b) => new Date(b.date ?? b.createdAt ?? 0).getTime() - new Date(a.date ?? a.createdAt ?? 0).getTime())
            .map(row => ({
                id: String(row.id),
                label: row.description || monthName(row.month, row.year),
                amount: Number(row.amount ?? 0),
                currency: DEFAULT_PAYMENT_CURRENCY,
                status: isPaidStatus(row.status) ? 'success' : 'error',
                date: getPaymentDate(row.date ?? row.createdAt),
            })),
    };
}

/**
 * Players with no team and no email (a parent's child added before any team
 * exists) belong to a club only through their guardian's — or their own —
 * account. Without this they are on nobody's roster.
 */
async function clubLinkedPlayerIds(clubId: number | null): Promise<number[]> {
    if (clubId == null) return [];
    const [viaGuardian, viaAccount] = await Promise.all([
        db.select({ id: playerGuardians.playerId }).from(playerGuardians)
            .innerJoin(users, eq(users.id, playerGuardians.userId))
            .where(eq(users.clubId, clubId)),
        db.select({ id: players.id }).from(players)
            .innerJoin(users, eq(users.id, players.userId))
            .where(eq(users.clubId, clubId)),
    ]);
    return Array.from(new Set([...viaGuardian, ...viaAccount].map((row) => row.id)));
}

/**
 * Attendance per player, counted per status in SQL (GROUP BY) instead of
 * loading every row of the club's history (~110k rows on two seasons). The
 * statuses stay raw so lib/attendanceRate.ts alone decides what counts.
 */
async function attendanceCountsByPlayer(playerIds: number[]) {
    const rows = await db
        .select({ playerId: attendance.playerId, status: attendance.status, count: sql<number>`count(*)::int` })
        .from(attendance)
        .where(inArray(attendance.playerId, playerIds))
        .groupBy(attendance.playerId, attendance.status);
    const byPlayer = new Map<number, Array<{ status: string | null; count: number }>>();
    for (const row of rows) {
        const list = byPlayer.get(row.playerId) ?? [];
        list.push({ status: row.status, count: Number(row.count) });
        byPlayer.set(row.playerId, list);
    }
    return byPlayer;
}

/** Each player's latest payment row (by month, then by creation) — one row per player. */
async function latestPaymentStatusByPlayer(playerIds: number[]) {
    const rows = await db
        .selectDistinctOn([playerPayments.playerId], { playerId: playerPayments.playerId, status: playerPayments.status })
        .from(playerPayments)
        .where(inArray(playerPayments.playerId, playerIds))
        .orderBy(playerPayments.playerId, desc(playerPayments.year), desc(playerPayments.month), desc(playerPayments.createdAt), playerPayments.id);
    return new Map(rows.map((row) => [row.playerId, row.status]));
}

async function buildRosterRows(req: AuthenticatedRequest, options: { stripForPlayerFacing?: boolean; withBalances?: boolean; onlyPlayerIds?: number[] } = {}) {
    const { stripForPlayerFacing = true, withBalances = true } = options;
    const isPlayerFacing = isPlayerFacingRole(req);
    let allowedTeamIds = await getAllowedTeamIds(req);

    if (isPlayerFacing) {
        const selfTeamIds = await getSelfTeamIds(req);
        allowedTeamIds = allowedTeamIds === null ? selfTeamIds : allowedTeamIds.filter(id => selfTeamIds.includes(id));
    }

    if (allowedTeamIds !== null && allowedTeamIds.length === 0) return [];

    let allPlayers: (typeof players.$inferSelect)[];
    let membershipRows: (typeof playersToTeams.$inferSelect)[];
    let allTeams: (typeof teams.$inferSelect)[];
    let clubIdByUserEmail: Map<string, number>;

    if (allowedTeamIds === null) {
        // Superadmin: genuinely every player.
        const [playerRows, memberRows, teamRows, userRows] = await Promise.all([
            db.select().from(players),
            db.select().from(playersToTeams),
            db.select().from(teams),
            db.select({ email: users.email, clubId: users.clubId }).from(users),
        ]);
        allPlayers = playerRows;
        membershipRows = memberRows;
        allTeams = teamRows;
        clubIdByUserEmail = new Map(
            userRows
                .filter(user => user.clubId != null)
                .map(user => [user.email.trim().toLowerCase(), Number(user.clubId)] as const)
        );
    } else {
        // Everyone else: query only what the caller's scope can contain. This
        // used to load EVERY player, membership, team and user in the database
        // on each roster call and filter in JS — cost grew with the whole
        // platform, not with the club.
        const clubId = getRequestClubId(req);
        if (!isPlayerFacing && clubId != null) await ensureClubPlayerRecords(clubId);

        // A club member who plays for no team yet is still on the club roster
        // (matched through their user account's club). NOT for player/parent
        // sessions though: their roster is their own team(s) only — including
        // club-mates here fed other squads' names into the player's "my teams"
        // set and leaked those squads' fixtures onto their home page.
        const clubUsers = !isPlayerFacing && clubId != null
            ? await db.select({ email: users.email }).from(users).where(eq(users.clubId, clubId))
            : [];
        const clubEmails = clubUsers.map(user => user.email.trim().toLowerCase()).filter(Boolean);

        const scopedMemberships = await db.select().from(playersToTeams).where(inArray(playersToTeams.teamId, allowedTeamIds));
        const memberPlayerIds = Array.from(new Set(scopedMemberships.map(m => m.playerId)));

        const playerConditions = [inArray(players.teamId, allowedTeamIds)];
        if (memberPlayerIds.length) playerConditions.push(inArray(players.id, memberPlayerIds));
        if (!isPlayerFacing) {
            const linkedIds = await clubLinkedPlayerIds(clubId);
            if (linkedIds.length) playerConditions.push(inArray(players.id, linkedIds));
        }
        if (clubEmails.length) playerConditions.push(inArray(sql<string>`lower(trim(${players.email}))`, clubEmails));

        const [playerRows, teamRows] = await Promise.all([
            db.select().from(players).where(or(...playerConditions)),
            db.select().from(teams).where(inArray(teams.id, allowedTeamIds)),
        ]);

        allPlayers = playerRows;
        allTeams = teamRows;
        const allowedTeamsSet = new Set(allowedTeamIds);
        const scopedPlayerIds = new Set(playerRows.map(p => p.id));
        membershipRows = playerRows.length
            ? (await db.select().from(playersToTeams).where(inArray(playersToTeams.playerId, Array.from(scopedPlayerIds))))
                .filter(m => allowedTeamsSet.has(m.teamId))
            : [];
        clubIdByUserEmail = new Map(clubId != null ? clubEmails.map(email => [email, clubId] as const) : []);
    }

    // A coach's roster: their teams' players and the club's unassigned ones,
    // never another squad's (contacts, medical visas, payments).
    if (req.user?.role === 'coach') {
        const managed = teamsManagedByCoach(allTeams, req.user?.id);
        const teamsOf = new Map<number, number[]>();
        for (const m of membershipRows) teamsOf.set(m.playerId, [...(teamsOf.get(m.playerId) ?? []), m.teamId]);
        const clubTeamIds = new Set(allTeams.map((t) => t.id));
        allPlayers = allPlayers.filter((p) => coachSeesPlayer(
            [...(teamsOf.get(p.id) ?? []), ...(p.teamId != null && clubTeamIds.has(p.teamId) ? [p.teamId] : [])],
            managed,
        ));
    }

    // One player's page needs one row, not the whole roster's aggregates.
    if (options.onlyPlayerIds) {
        const only = new Set(options.onlyPlayerIds);
        allPlayers = allPlayers.filter((p) => only.has(p.id));
    }

    if (!allPlayers.length) return [];

    const playerIds = allPlayers.map(p => p.id);
    const [attendanceCounts, latestPaymentStatus] = await Promise.all([
        attendanceCountsByPlayer(playerIds),
        latestPaymentStatusByPlayer(playerIds),
    ]);

    const teamsById = new Map(allTeams.map(t => [t.id, t]));

    const teamsByPlayer = new Map<number, { name: string; leagueName: string }[]>();
    for (const row of membershipRows) {
        const team = teamsById.get(row.teamId);
        if (!team) continue;
        const list = teamsByPlayer.get(row.playerId) || [];
        list.push({ name: team.name, leagueName: team.leagueName || '' });
        teamsByPlayer.set(row.playerId, list);
    }
    
    for (const p of allPlayers) {
        if (p.teamId) {
            const team = teamsById.get(p.teamId);
            if (team) {
                const list = teamsByPlayer.get(p.id) || [];
                if (!list.some(t => t.name === team.name)) {
                    list.push({ name: team.name, leagueName: team.leagueName || '' });
                    teamsByPlayer.set(p.id, list);
                }
            }
        }
    }

    const attendanceByPlayer = new Map<number, { present: number; total: number }>();
    for (const [playerId, buckets] of attendanceCounts) {
        const summary = attendanceSummaryFromCounts(buckets);
        attendanceByPlayer.set(playerId, { present: summary.attended, total: summary.counted });
    }

    // Staff rosters show what each player owes from the shared fee calculation.
    // The latest payment row's status (the old signal) only stays as a fallback
    // for a platform-wide superadmin view, which has no single club to bill.
    const balanceStatus = new Map<number, string>();
    const requesterClubId = getRequestClubId(req);
    if (withBalances && !isPlayerFacing && requesterClubId != null) {
        for (const balance of await clubBalances(requesterClubId)) {
            balanceStatus.set(balance.playerId, paymentStatusFromState(balance.state));
        }
    }

    const rows = allPlayers.map(player => {
        const firstName = player.firstName || player.name?.split(' ')[0] || 'Unknown';
        const lastName = player.lastName || player.name?.split(' ').slice(1).join(' ') || 'Player';
        const playerTeams = teamsByPlayer.get(player.id) || [];
        const sortedTeams = [...playerTeams].sort((a, b) => b.name.localeCompare(a.name));
        const category = sortedTeams[0]?.name || 'Unassigned';
        const teamNames = playerTeams.map((team) => team.name);
        const clubId = player.email ? clubIdByUserEmail.get(player.email.trim().toLowerCase()) ?? null : null;

        const attendanceStats = attendanceByPlayer.get(player.id);
        const attendanceRate = attendanceStats && attendanceStats.total > 0
            ? Math.round((attendanceStats.present / attendanceStats.total) * 100)
            : 0;

        const paymentStatus = balanceStatus.get(player.id) ?? latestPaymentStatus.get(player.id) ?? 'pending';

        return {
            ...player,
            firstName,
            lastName,
            category,
            attendanceRate,
            paymentStatus,
            teamName: teamNames[0] || 'Unassigned',
            teamNames,
            clubId,
            isUnassigned: teamNames.length === 0,
        };
    });

    // A player/parent session only gets teammate-safe fields (name, number,
    // position, team) — never another player's payment/medical/attendance/
    // contact data. Their own data is still reachable through the dedicated
    // "me" endpoints, not this shared roster.
    if (isPlayerFacing && stripForPlayerFacing) return rows.map(toSafeRosterRow);
    // The accountant works with payments, not medical visas.
    if (req.user?.role === 'accountant') return rows.map((row) => ({ ...row, medicalCheckExpiry: null }));
    return rows;
}

// Shared by getPlayerById and getMe — callers must already have verified the
// requester is allowed to see this exact player's full (unstripped) record.
async function buildFullPlayerPayload(req: AuthenticatedRequest, player: typeof players.$inferSelect) {
    const rosterRows = await buildRosterRows(req, { stripForPlayerFacing: false, withBalances: false, onlyPlayerIds: [player.id] });
    const rosterPlayer = rosterRows.find(row => row.id === player.id);
    const paymentSummary = await buildPlayerPaymentSummary(player, getRequestClubId(req) ?? rosterPlayer?.clubId ?? null);

    return {
        ...player,
        ...rosterPlayer,
        ...paymentSummary,
        clubId: rosterPlayer?.clubId ?? await getPlayerClubIdByEmail(player.email),
        isUnassigned: rosterPlayer?.isUnassigned ?? true,
        teamName: rosterPlayer?.teamName ?? 'Unassigned',
        teamNames: rosterPlayer?.teamNames ?? [],
        category: rosterPlayer?.category ?? 'Unassigned',
    };
}

// "Echipa mea" and the club screens now share one definition
// (lib/attendanceRate.ts), so they can no longer disagree about a player.
function summarizeOwnAttendance(rows: { status: string | null }[]) {
    const summary = attendanceSummary(rows);
    return {
        rate: summary.rate == null ? null : Math.round(summary.rate),
        present: summary.attended,
        total: summary.counted,
    };
}

function mapTeamEvent(event: typeof events.$inferSelect) {
    return {
        id: event.id,
        type: event.type,
        title: event.title,
        location: event.location ?? null,
        // Raw DB text is zone-less; the browser read it as local time (R3-4).
        startTime: toIso(event.startTime) ?? event.startTime,
        endTime: toIso(event.endTime) ?? event.endTime,
        status: event.status ?? 'scheduled',
        coachNote: event.coachNote ?? null,
    };
}

/**
 * Teams the authenticated player belongs to, scoped to their own club.
 * A membership row is not enough on its own: a stale row pointing at another
 * club's team would otherwise expose that team's name, coach and squad.
 */
async function getScopedTeamsForSelf(req: AuthenticatedRequest, self: typeof players.$inferSelect) {
    const teamIds = await getTeamIdsForPlayer(self.id, self.teamId ?? null);
    if (!teamIds.length) return [];

    const teamRows = await db.select().from(teams).where(inArray(teams.id, teamIds));
    if (isSuperadmin(req)) return teamRows;

    const clubId = getRequestClubId(req);
    if (clubId == null) return [];
    return teamRows.filter(team => team.clubId === clubId);
}

// Squad list a teammate is allowed to see: identity and shirt number only.
// No email, medical, payment or attendance data belonging to someone else.
async function getTeammatesForTeam(teamId: number, selfId: number) {
    const [directRows, relationRows] = await Promise.all([
        db.select().from(players).where(eq(players.teamId, teamId)),
        db
            .select({ player: players })
            .from(playersToTeams)
            .innerJoin(players, eq(playersToTeams.playerId, players.id))
            .where(eq(playersToTeams.teamId, teamId)),
    ]);

    const unique = new Map<number, typeof players.$inferSelect>();
    directRows.forEach(player => unique.set(player.id, player));
    relationRows.forEach(row => unique.set(row.player.id, row.player));

    return Array.from(unique.values())
        .map(player => ({
            id: player.id,
            firstName: player.firstName || player.name?.split(' ')[0] || 'Unknown',
            lastName: player.lastName || player.name?.split(' ').slice(1).join(' ') || 'Player',
            number: player.number ?? null,
            avatarUrl: player.avatarUrl ?? null,
            isMe: player.id === selfId,
        }))
        .sort((a, b) => {
            if (a.number != null && b.number != null && a.number !== b.number) return a.number - b.number;
            if ((a.number == null) !== (b.number == null)) return a.number == null ? 1 : -1;
            return `${a.lastName} ${a.firstName}`.localeCompare(`${b.lastName} ${b.firstName}`);
        });
}

/**
 * Same "which players can this caller see" rule for both searchPlayers and
 * browsePlayers, so the two never drift apart. `skip` means the caller's
 * club has no teams at all — every caller answers with an empty result,
 * `scope` is undefined only for a superadmin (no club to scope to).
 */
async function buildPlayerScope(req: AuthenticatedRequest): Promise<{ skip: true } | { skip: false; scope: ReturnType<typeof or> | undefined }> {
    const allowedTeamIds = await getAllowedTeamIds(req);
    if (allowedTeamIds !== null && allowedTeamIds.length === 0) return { skip: true };

    let scope;
    if (allowedTeamIds !== null) {
        const clubId = getRequestClubId(req);
        const memberIds = (await db.select({ playerId: playersToTeams.playerId }).from(playersToTeams).where(inArray(playersToTeams.teamId, allowedTeamIds)))
            .map((row) => row.playerId);
        const clubEmails = clubId != null
            ? (await db.select({ email: users.email }).from(users).where(eq(users.clubId, clubId))).map((row) => row.email.trim().toLowerCase())
            : [];
        const inClub = [inArray(players.teamId, allowedTeamIds)];
        if (memberIds.length) inClub.push(inArray(players.id, memberIds));
        if (clubEmails.length) inClub.push(inArray(sql<string>`lower(trim(${players.email}))`, clubEmails));
        const linkedIds = await clubLinkedPlayerIds(clubId);
        if (linkedIds.length) inClub.push(inArray(players.id, linkedIds));
        scope = or(...inClub);
        const managed = await coachManagedTeamIds(req);
        if (managed !== null) scope = and(scope, coachVisiblePlayers(managed));
    }
    return { skip: false, scope };
}

export const playersController = {
    async searchPlayers(req: AuthenticatedRequest, res: Response) {
        try {
            // Roster-management-only: returns unfiltered player rows (medical,
            // payment, contact fields) so it's used to find a player to add to a
            // team, not something a player/parent session should ever reach.
            if (isPlayerFacingRole(req)) {
                return res.status(403).json({ error: 'Forbidden' });
            }

            const { query } = req.query;
            if (!query || typeof query !== 'string') {
                return res.status(400).json({ error: 'Search query is required' });
            }

            const built = await buildPlayerScope(req);
            if (built.skip) return res.json([]);

            const q = query.trim().toLowerCase().slice(0, 80);
            if (!q) return res.json([]);
            // Filtered in SQL and scoped to the caller's club. This used to load
            // every player and every user of the platform on each keystroke.
            const pattern = `%${q.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
            const nameMatch = sql`lower(concat_ws(' ', ${players.firstName}, ${players.lastName}, ${players.name})) like ${pattern}`;

            const results = await db.select().from(players)
                .where(built.scope ? and(nameMatch, built.scope) : nameMatch)
                .orderBy(players.lastName, players.firstName)
                .limit(50);

            res.json(results);
        } catch (error) {
            console.error('Search players error:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    },

    // Same audience and visibility rule as searchPlayers, but for "show me who
    // I could add" before the admin has typed anything — paged, newest first,
    // so a just-created player doesn't require already knowing their name.
    async browsePlayers(req: AuthenticatedRequest, res: Response) {
        try {
            if (isPlayerFacingRole(req)) {
                return res.status(403).json({ error: 'Forbidden' });
            }

            const built = await buildPlayerScope(req);
            if (built.skip) return res.json({ items: [], hasMore: false });

            const limit = Math.min(Math.max(parseInt(String(req.query.limit ?? '20'), 10) || 20, 1), 50);
            const offset = Math.max(parseInt(String(req.query.offset ?? '0'), 10) || 0, 0);

            const rows = await db.select().from(players)
                .where(built.scope ?? sql`true`)
                .orderBy(desc(players.createdAt), desc(players.id))
                .limit(limit + 1)
                .offset(offset);

            res.json({ items: rows.slice(0, limit), hasMore: rows.length > limit });
        } catch (error) {
            console.error('Browse players error:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    },

    async getRoster(req: AuthenticatedRequest, res: Response) {
        try {
            const rosterWithData = await buildRosterRows(req);
            // ?page=… (Lot): one page, searched, filtered and sorted here
            // (lib/rosterQuery.ts). Without it: the whole list, as other screens read it.
            const query = parseRosterQuery(req.query as Record<string, unknown>);
            res.json(query ? applyRosterQuery(rosterWithData, query) : rosterWithData);
        } catch (error) {
            console.error('Get roster error:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    },

    async getRosterSummary(req: AuthenticatedRequest, res: Response) {
        try {
            // Club/team-wide attendance & payment aggregates — a management
            // view, not something player/parent sessions consume today.
            if (isPlayerFacingRole(req)) {
                return res.status(403).json({ error: 'Forbidden' });
            }

            const rosterRows = await buildRosterRows(req);
            const rosterPlayerIds = rosterRows.map(row => row.id);

            const averageAttendance = rosterRows.length > 0
                ? Math.round((rosterRows.reduce((sum, row) => sum + (row.attendanceRate || 0), 0) / rosterRows.length) * 10) / 10
                : 0;

            if (!rosterPlayerIds.length) {
                return res.json({
                    athleteCount: 0,
                    averageAttendance,
                    currentPeriodAttendance: null,
                    previousPeriodAttendance: null,
                    attendanceDelta: null,
                    pendingPayments: 0,
                    pendingPlayerIds: [],
                    owingPayments: 0,
                });
            }

            const now = new Date();
            const currentStart = new Date(now);
            currentStart.setDate(currentStart.getDate() - 30);
            const previousStart = new Date(currentStart);
            previousStart.setDate(previousStart.getDate() - 30);

            // The last two 30-day windows, counted per status in SQL: this used
            // to load the roster's entire attendance history to read 60 days.
            const [nowIso, currentIso, previousIso] = [now, currentStart, previousStart].map((date) => date.toISOString());
            const periodRows = await db
                .select({
                    status: attendance.status,
                    current: sql<number>`(count(*) filter (where ${attendance.date} >= ${currentIso} and ${attendance.date} <= ${nowIso}))::int`,
                    previous: sql<number>`(count(*) filter (where ${attendance.date} < ${currentIso}))::int`,
                })
                .from(attendance)
                .where(and(inArray(attendance.playerId, rosterPlayerIds), gte(attendance.date, previousIso)))
                .groupBy(attendance.status);

            const currentPeriodAttendance = attendanceSummaryFromCounts(periodRows.map((row) => ({ status: row.status, count: Number(row.current) }))).rate;
            const previousPeriodAttendance = attendanceSummaryFromCounts(periodRows.map((row) => ({ status: row.status, count: Number(row.previous) }))).rate;

            const attendanceDelta = currentPeriodAttendance !== null && previousPeriodAttendance !== null
                ? Math.round((currentPeriodAttendance - previousPeriodAttendance) * 10) / 10
                : null;

            // Same answer as the roster's payment column (shared balances).
            // „Restanțe” are players with something past due; owing money that
            // is not due yet is „de plată” (owingPayments).
            const pendingPlayerIds = rosterRows.filter(row => row.paymentStatus === 'overdue').map(row => row.id);
            const owingPayments = rosterRows.filter(row => !isPaidStatus(row.paymentStatus)).length;

            res.json({
                athleteCount: rosterRows.length,
                averageAttendance,
                currentPeriodAttendance,
                previousPeriodAttendance,
                attendanceDelta,
                pendingPayments: pendingPlayerIds.length,
                pendingPlayerIds,
                owingPayments,
            });
        } catch (error) {
            console.error('Get roster summary error:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    },

    async sendPaymentReminders(req: AuthenticatedRequest, res: Response) {
        try {
            const role = req.user?.role;
            if (role !== 'admin' && role !== 'superadmin' && role !== 'accountant' && role !== 'manager') {
                return res.status(403).json({ error: 'Forbidden' });
            }
            const clubId = getRequestClubId(req);
            if (clubId == null) {
                return res.status(400).json({ error: 'Alege un club.' });
            }
            // Who is late paying (restanță = something past due), from the shared
            // fee calculation — then an in-app notification to the player and
            // their parents. Money owed but not yet due gets no reminder.
            const late = (await clubBalances(clubId)).filter((balance) => balance.overdue > 0);
            const { notified, skipped } = await sendReminderNotifications(late);
            res.json({
                sent: notified,
                players: late.length,
                skipped,
                recipients: late.map((balance) => ({ id: balance.playerId, name: balance.playerName, outstanding: balance.outstanding, overdue: balance.overdue })),
                sentAt: new Date().toISOString(),
                provider: 'in-app',
            });
        } catch (error) {
            console.error('Send payment reminders error:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    },

    async removeFromRoster(req: AuthenticatedRequest, res: Response) {
        try {
            const role = req.user?.role;
            if (role !== 'admin' && role !== 'superadmin' && role !== 'coach' && role !== 'manager') {
                return res.status(403).json({ error: 'Forbidden' });
            }

            const id = parseInt(req.params.id as string, 10);
            if (Number.isNaN(id)) return res.status(400).json({ error: 'Invalid player id' });

            const allowedTeamIds = await getAllowedTeamIds(req);
            if (allowedTeamIds !== null) {
                const pRows = await db.select().from(players).where(eq(players.id, id)).limit(1);
                const p = pRows[0];
                if (!p) return res.status(404).json({ error: 'Not found' });
                const mRows = await db.select().from(playersToTeams).where(eq(playersToTeams.playerId, id));
                
                const allowedSet = new Set(allowedTeamIds);
                const isAllowed = (p.teamId && allowedSet.has(p.teamId)) || mRows.some(m => allowedSet.has(m.teamId));
                if (!isAllowed) return res.status(403).json({ error: 'Access denied' });
                if (!await coachMayEditPlayer(req, p.id, p.teamId ?? null)) return res.status(403).json({ error: COACH_SCOPE_ERROR });
            }

            await db.delete(playersToTeams).where(eq(playersToTeams.playerId, id));
            await db.update(players).set({ teamId: null, status: 'inactive' }).where(eq(players.id, id));
            await auditPlayer(req, 'player.removed_from_roster', id, {});

            res.json({ success: true });
        } catch (error) {
            console.error('Remove from roster error:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    },

    async addPlayerToTeam(req: AuthenticatedRequest, res: Response) {
        try {
            const role = req.user?.role;
            if (role !== 'admin' && role !== 'superadmin' && role !== 'coach' && role !== 'manager') {
                return res.status(403).json({ error: 'Forbidden' });
            }

            const playerId = Number(req.body?.playerId);
            const teamId = Number(req.body?.teamId);
            if (!Number.isInteger(playerId) || playerId <= 0 || !Number.isInteger(teamId) || teamId <= 0) {
                return res.status(400).json({ error: 'playerId and teamId required' });
            }

            const allowedTeamIds = await getAllowedTeamIds(req);
            if (allowedTeamIds !== null && !allowedTeamIds.includes(teamId)) {
                return res.status(403).json({ error: 'Cannot add to a team outside your club' });
            }
            if (!await coachMayUseTeam(req, teamId)) {
                return res.status(403).json({ error: 'Poți adăuga jucători doar în echipele pe care le antrenezi.' });
            }

            const pRows = await db.select().from(players).where(eq(players.id, playerId)).limit(1);
            const player = pRows[0];
            if (!player) return res.status(404).json({ error: 'Player not found' });

            // The team check alone let a caller attach ANY player id — including
            // another club's — to their own team, and then read that player's
            // full record through the roster. The player must be ours too.
            if (allowedTeamIds !== null && !await isPlayerAllowedForRequest(req, player)) {
                return res.status(403).json({ error: 'Access denied' });
            }

            // Idempotent: a double-submit must not create duplicate memberships.
            const existing = await db.select().from(playersToTeams)
                .where(and(eq(playersToTeams.playerId, playerId), eq(playersToTeams.teamId, teamId)))
                .limit(1);

            const membership = existing[0] ?? (await db.insert(playersToTeams).values({ playerId, teamId }).returning())[0];

            await db.update(players).set({ teamId, status: 'active' }).where(eq(players.id, playerId));
            if (!existing[0]) {
                const [team] = await db.select({ name: teams.name }).from(teams).where(eq(teams.id, teamId)).limit(1);
                await auditPlayer(req, 'player.added_to_team', playerId, { teamId, teamName: team?.name ?? null });
            }

            res.json(membership);
        } catch (error) {
            console.error('Add player to team error:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    },

    async updatePlayer(req: AuthenticatedRequest, res: Response) {
        try {
            const role = req.user?.role;
            if (role !== 'admin' && role !== 'superadmin' && role !== 'coach' && role !== 'manager') {
                return res.status(403).json({ error: 'Forbidden' });
            }

            const playerId = parseInt(req.params.id as string, 10);
            if (Number.isNaN(playerId)) return res.status(400).json({ error: 'Invalid id' });

            const pRows = await db.select().from(players).where(eq(players.id, playerId)).limit(1);
            if (!pRows[0]) return res.status(404).json({ error: 'Player not found' });

            const allowedTeamIds = await getAllowedTeamIds(req);
            if (allowedTeamIds !== null) {
                const p = pRows[0];
                if (!await isPlayerAllowedForRequest(req, p)) return res.status(403).json({ error: 'Access denied' });
                if (!await coachMayEditPlayer(req, p.id, p.teamId ?? null)) return res.status(403).json({ error: COACH_SCOPE_ERROR });
            }

            const update = buildPlayerUpdate(req.body);
            if (!update.ok) {
                return res.status(400).json({ error: update.error });
            }

            // The email is what links a sign-in to this roster record
            // (lib/selfPlayer.ts). Two records with one address made the link
            // ambiguous, and a typo could hand a family someone else's child.
            const previousEmail = pRows[0].email?.trim().toLowerCase() || null;
            const nextEmail = update.data.email !== undefined ? (update.data.email?.trim().toLowerCase() || null) : previousEmail;
            if (update.data.email !== undefined) {
                update.data.email = nextEmail;
                if (nextEmail && nextEmail !== previousEmail) {
                    const [taken] = await db.select({ id: players.id }).from(players)
                        .where(and(sql`lower(trim(${players.email})) = ${nextEmail}`, sql`${players.id} <> ${playerId}`))
                        .limit(1);
                    if (taken) {
                        return res.status(409).json({ error: 'Acest email este deja folosit de alt jucător din lot.' });
                    }
                }
            }

            // A new email means the record belongs to whichever account signs in
            // with it next; the previous account's claim is released.
            const unlink = nextEmail !== previousEmail ? { userId: null } : {};
            const [updated] = await db.update(players).set({ ...update.data, ...unlink }).where(eq(players.id, playerId)).returning();
            const before = pRows[0] as Record<string, unknown>;
            const changes: Record<string, { before: unknown; after: unknown }> = {};
            for (const field of HISTORY_FIELDS) {
                if (!(field in update.data)) continue;
                const previous = before[field] ?? null;
                const next = (updated as Record<string, unknown>)[field] ?? null;
                if (String(previous ?? '') !== String(next ?? '')) changes[field] = { before: previous, after: next };
            }
            if (Object.keys(changes).length) {
                await auditPlayer(req, 'player.updated', playerId, { changes });
            }
            if (nextEmail !== previousEmail) {
                await writeAuditLog({
                    action: 'player.email_changed',
                    entityType: 'player',
                    entityId: playerId,
                    actorUserId: req.user?.id ?? null,
                    actorUid: req.firebaseUser?.uid ?? null,
                    actorRole: req.user?.role ?? null,
                    clubId: getRequestClubId(req),
                    metadata: { before: previousEmail, after: nextEmail },
                }).catch((error) => console.error('[players] audit log failed:', error));
            }
            res.json(updated);
        } catch (error) {
            console.error('Update player error:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    },

    async getPlayerById(req: AuthenticatedRequest, res: Response) {
        try {
            const playerId = parseInt(req.params.id as string, 10);
            if (Number.isNaN(playerId)) return res.status(400).json({ error: 'Invalid id' });

            const pRows = await db.select().from(players).where(eq(players.id, playerId)).limit(1);
            const player = pRows[0];
            if (!player) return res.status(404).json({ error: 'Player not found' });

            if (isPlayerFacingRole(req)) {
                // A player/parent may only ever fetch their own record — never a
                // teammate's, which would otherwise carry payment/medical data.
                const self = await getSelfPlayerRecord(req);
                if (!self || self.id !== playerId) {
                    return res.status(403).json({ error: 'Access denied' });
                }
            } else {
                const allowedTeamIds = await getAllowedTeamIds(req);
                if (allowedTeamIds !== null) {
                    if (!await isPlayerAllowedForRequest(req, player)) return res.status(403).json({ error: req.user?.role === 'coach' ? COACH_READ_ERROR : 'Access denied' });
                }
            }

            res.json(await buildFullPlayerPayload(req, player));
        } catch (error) {
            console.error('Get player by id error:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    },

    /** Staff only: what changed on this player's record, newest first. */
    async getPlayerHistory(req: AuthenticatedRequest, res: Response) {
        try {
            if (isPlayerFacingRole(req)) return res.status(403).json({ error: 'Forbidden' });
            const playerId = parseInt(req.params.id as string, 10);
            if (Number.isNaN(playerId)) return res.status(400).json({ error: 'Invalid id' });
            const [player] = await db.select().from(players).where(eq(players.id, playerId)).limit(1);
            if (!player) return res.status(404).json({ error: 'Player not found' });
            if (!isSuperadmin(req) && !await isPlayerAllowedForRequest(req, player)) {
                return res.status(403).json({ error: req.user?.role === 'coach' ? COACH_READ_ERROR : 'Access denied' });
            }
            res.json({ logs: await listPlayerHistory(isSuperadmin(req) ? null : getRequestClubId(req), playerId) });
        } catch (error) {
            console.error('Get player history error:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    },

    // Own-record lookup for player/parent sessions that don't know their
    // `players.id` — resolves it from the authenticated user's email instead
    // of requiring a client-supplied id, so there's nothing to guess or spoof.
    async getMe(req: AuthenticatedRequest, res: Response) {
        try {
            const self = await getSelfPlayerRecord(req);
            if (!self) return res.status(404).json({ error: 'No player record linked to this account' });

            res.json(await buildFullPlayerPayload(req, self));
        } catch (error) {
            console.error('Get self player error:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    },

    /**
     * The caller's OWN attendance rows, in one request. Two modes:
     *
     *  • `?eventIds=1,2,3` (max 100) — rows for those events. Used by the
     *    player home, which already holds its team-scoped event list.
     *  • no eventIds, `?limit=N` (default 40, max 100) — the most recent marked
     *    sessions, joined with their events, newest first. Used by the Prezență
     *    history, which previously fetched the whole CLUB's calendar and took
     *    the latest 40 — in a multi-team club most of those weren't the
     *    player's, so their own history came back short.
     *
     * Either way the answer is the caller's rows only: the player screens used
     * to call GET /events/:id/attendance once per session (20–40 requests) and
     * pick their row out of the full sheet.
     */
    async getMyAttendance(req: AuthenticatedRequest, res: Response) {
        try {
            const raw = String(req.query.eventIds ?? '').trim();
            const self = await getSelfPlayerRecord(req);

            if (raw) {
                const eventIds = Array.from(new Set(
                    raw.split(',').map((value) => Number(value.trim())).filter((id) => Number.isInteger(id) && id > 0),
                ));
                if (eventIds.length > 100) {
                    return res.status(400).json({ error: 'Too many event ids (max 100).' });
                }
                if (!self || !eventIds.length) return res.json([]);

                const rows = await db
                    .select({ eventId: attendance.eventId, status: attendance.status, note: attendance.note })
                    .from(attendance)
                    .where(and(eq(attendance.playerId, self.id), inArray(attendance.eventId, eventIds)));

                return res.json(rows.map((row) => ({
                    eventId: row.eventId,
                    playerId: self.id,
                    status: row.status,
                    note: row.note ?? null,
                })));
            }

            const requested = Number(req.query.limit ?? 40);
            const limit = Number.isInteger(requested) ? Math.min(Math.max(requested, 1), 100) : 40;
            if (!self) return res.json([]);

            const rows = await db
                .select({
                    status: attendance.status,
                    note: attendance.note,
                    event: {
                        id: events.id,
                        type: events.type,
                        title: events.title,
                        description: events.description,
                        location: events.location,
                        startTime: events.startTime,
                        endTime: events.endTime,
                        teamId: events.teamId,
                        status: events.status,
                        coachNote: events.coachNote,
                    },
                    teamName: teams.name,
                })
                .from(attendance)
                .innerJoin(events, eq(attendance.eventId, events.id))
                .leftJoin(teams, eq(events.teamId, teams.id))
                .where(and(
                    eq(attendance.playerId, self.id),
                    lte(events.startTime, new Date().toISOString()),
                    sql`coalesce(${events.status}, '') <> 'cancelled'`,
                ))
                .orderBy(desc(events.startTime))
                .limit(limit);

            res.json(rows.map((row) => ({
                eventId: row.event.id,
                playerId: self.id,
                status: row.status,
                note: row.note ?? null,
                event: {
                    ...row.event,
                    // Same serialisation as GET /events, so the client parses
                    // both identically.
                    startTime: toIso(row.event.startTime) ?? row.event.startTime,
                    endTime: toIso(row.event.endTime) ?? row.event.endTime,
                    coachId: null,
                    amount: null,
                    status: row.event.status ?? 'scheduled',
                    teamName: row.teamName ?? null,
                },
            })));
        } catch (error) {
            console.error('Get my attendance error:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    },

    // Teams the caller plays for — one card per team on "Echipa mea", with just
    // enough per-team context (coach, squad size, next session, own attendance)
    // to choose which one to open. No squad names here.
    async getMyTeams(req: AuthenticatedRequest, res: Response) {
        try {
            const self = await getSelfPlayerRecord(req);
            if (!self) return res.json([]);

            const teamRows = await getScopedTeamsForSelf(req, self);
            if (!teamRows.length) return res.json([]);

            const teamIds = teamRows.map(team => team.id);
            const coachIds = Array.from(new Set(teamRows.map(team => team.coachId).filter((id): id is number => id != null)));

            const [directPlayers, membershipRows, coachRows, eventRows, attendanceRows] = await Promise.all([
                db.select({ id: players.id, teamId: players.teamId }).from(players).where(inArray(players.teamId, teamIds)),
                db.select().from(playersToTeams).where(inArray(playersToTeams.teamId, teamIds)),
                coachIds.length
                    ? db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, coachIds))
                    : Promise.resolve([] as { id: number; name: string }[]),
                db.select().from(events).where(inArray(events.teamId, teamIds)),
                db.select().from(attendance).where(eq(attendance.playerId, self.id)),
            ]);

            const coachNameById = new Map(coachRows.map(coach => [coach.id, coach.name]));
            const squadByTeam = new Map<number, Set<number>>();
            const addToSquad = (teamId: number, playerId: number) => {
                const bucket = squadByTeam.get(teamId) ?? new Set<number>();
                bucket.add(playerId);
                squadByTeam.set(teamId, bucket);
            };
            directPlayers.forEach(player => { if (player.teamId != null) addToSquad(player.teamId, player.id); });
            membershipRows.forEach(row => addToSquad(row.teamId, row.playerId));

            const now = Date.now();

            res.json(teamRows.map(team => {
                const teamEvents = eventRows.filter(event => event.teamId === team.id && event.status !== 'cancelled');
                const upcoming = teamEvents
                    .filter(event => (toDate(event.startTime)?.getTime() ?? 0) >= now)
                    .sort((a, b) => (toDate(a.startTime)?.getTime() ?? 0) - (toDate(b.startTime)?.getTime() ?? 0));
                const ownAttendance = attendanceRows.filter(row => row.teamId === team.id);

                return {
                    id: team.id,
                    name: team.name,
                    leagueName: team.leagueName,
                    seasonName: team.seasonName,
                    gender: team.gender,
                    level: team.level,
                    isActive: team.isActive,
                    coachName: team.coachId != null ? coachNameById.get(team.coachId) ?? null : null,
                    playerCount: squadByTeam.get(team.id)?.size ?? 0,
                    upcomingCount: upcoming.length,
                    nextEvent: upcoming[0] ? mapTeamEvent(upcoming[0]) : null,
                    attendance: summarizeOwnAttendance(ownAttendance),
                };
            }).sort((a, b) => a.name.localeCompare(b.name)));
        } catch (error) {
            console.error('Get my teams error:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    },

    // One of the caller's own teams, expanded: squad, coach, schedule and their
    // own attendance record for that team. Membership is re-checked here — the
    // team id comes from the URL, so it is never trusted on its own.
    async getMyTeamDetail(req: AuthenticatedRequest, res: Response) {
        try {
            const teamId = Number(req.params.teamId);
            if (!Number.isFinite(teamId)) {
                return res.status(400).json({ error: 'Invalid team id' });
            }

            const self = await getSelfPlayerRecord(req);
            if (!self) return res.status(404).json({ error: 'No player record linked to this account' });

            const teamRows = await getScopedTeamsForSelf(req, self);
            const team = teamRows.find(row => row.id === teamId);
            if (!team) return res.status(403).json({ error: 'You are not a member of this team.' });

            const [roster, coachRows, eventRows, attendanceRows] = await Promise.all([
                getTeammatesForTeam(team.id, self.id),
                team.coachId != null
                    ? db.select({ id: users.id, name: users.name }).from(users).where(eq(users.id, team.coachId)).limit(1)
                    : Promise.resolve([] as { id: number; name: string }[]),
                db.select().from(events).where(eq(events.teamId, team.id)),
                db.select().from(attendance).where(eq(attendance.playerId, self.id)),
            ]);

            const ownAttendance = attendanceRows.filter(row => row.teamId === team.id);
            const attendanceByEvent = new Map(ownAttendance.filter(row => row.eventId != null).map(row => [row.eventId as number, row]));

            const now = Date.now();
            const liveEvents = eventRows.filter(event => event.status !== 'cancelled');
            const upcomingEvents = liveEvents
                .filter(event => (toDate(event.startTime)?.getTime() ?? 0) >= now)
                .sort((a, b) => (toDate(a.startTime)?.getTime() ?? 0) - (toDate(b.startTime)?.getTime() ?? 0))
                .slice(0, 10)
                .map(mapTeamEvent);
            const recentEvents = liveEvents
                .filter(event => (toDate(event.startTime)?.getTime() ?? 0) < now)
                .sort((a, b) => (toDate(b.startTime)?.getTime() ?? 0) - (toDate(a.startTime)?.getTime() ?? 0))
                .slice(0, 10)
                .map(event => {
                    const record = attendanceByEvent.get(event.id);
                    return {
                        ...mapTeamEvent(event),
                        myStatus: record?.status ?? null,
                        // The coach's private note on *this player* for that
                        // session — never another teammate's.
                        myNote: record?.note ?? null,
                    };
                });

            res.json({
                id: team.id,
                name: team.name,
                leagueName: team.leagueName,
                seasonName: team.seasonName,
                gender: team.gender,
                level: team.level,
                isActive: team.isActive,
                // inviteCode is deliberately omitted: it is a join credential,
                // not team info a player needs.
                coach: coachRows[0] ? { id: coachRows[0].id, name: coachRows[0].name } : null,
                playerCount: roster.length,
                roster,
                attendance: summarizeOwnAttendance(ownAttendance),
                upcomingEvents,
                recentEvents,
            });
        } catch (error) {
            console.error('Get my team detail error:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    },
};
