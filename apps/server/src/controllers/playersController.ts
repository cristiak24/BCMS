import { Request, Response } from 'express';
import { db } from '../db';
import { players, teams, playersToTeams, attendance, playerPayments, users, events } from '../db/schema';
import { eq, inArray } from 'drizzle-orm';
import { AuthenticatedRequest } from '../middleware/auth';
import { buildPlayerUpdate } from '../lib/playerUpdate';

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
const SENSITIVE_ROSTER_FIELDS = ['email', 'medicalCheckExpiry', 'attendanceRate', 'paymentStatus'] as const;

function toSafeRosterRow<T extends Record<string, unknown>>(row: T): T {
    const safe = { ...row };
    for (const key of SENSITIVE_ROSTER_FIELDS) {
        if (key in safe) (safe as Record<string, unknown>)[key] = null;
    }
    return safe;
}

async function getSelfPlayerRecord(req: AuthenticatedRequest) {
    const email = req.user?.email;
    if (!email) return null;
    const rows = await db.select().from(players).where(eq(players.email, String(email).trim().toLowerCase())).limit(1);
    return rows[0] ?? null;
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

function normalizePaymentStatus(status?: string | null) {
    return (status || '').trim().toLowerCase();
}

function isPaidStatus(status?: string | null) {
    const normalized = normalizePaymentStatus(status);
    return normalized === 'paid' || normalized === 'processed' || normalized === 'succeeded' || normalized === 'success';
}

function isAttendancePresent(status?: string | null) {
    const normalized = (status || '').trim().toLowerCase();
    return normalized === 'present' || normalized === 'late' || normalized === 'medical' || normalized === 'excused';
}

async function getAllowedTeamIds(req: AuthenticatedRequest) {
    if (isSuperadmin(req)) return null; 
    const clubId = getRequestClubId(req);
    if (clubId == null) return [];
    const clubTeams = await db.select({ id: teams.id }).from(teams).where(eq(teams.clubId, clubId));
    return clubTeams.map(t => t.id);
}

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

    const allowedSet = new Set(allowedTeamIds);
    const membershipRows = await db.select().from(playersToTeams).where(eq(playersToTeams.playerId, player.id));
    const isAssignedToAllowedTeam = Boolean(player.teamId && allowedSet.has(player.teamId)) || membershipRows.some(m => allowedSet.has(m.teamId));
    if (isAssignedToAllowedTeam) return true;

    const requestClubId = getRequestClubId(req);
    const playerClubId = await getPlayerClubIdByEmail(player.email);
    return requestClubId != null && playerClubId === requestClubId;
}

function monthName(month?: number | null, year?: number | null) {
    if (!month || !year) return 'Season Fee';
    return `${new Intl.DateTimeFormat('en', { month: 'long' }).format(new Date(year, month - 1, 1))} ${year} Fee`;
}

function getPaymentDate(value?: string | null) {
    return value ? new Date(value).toISOString() : new Date().toISOString();
}

async function buildPlayerPaymentSummary(playerId: number) {
    const paymentRows = await db.select().from(playerPayments).where(eq(playerPayments.playerId, playerId));
    const paidRows = paymentRows.filter(row => isPaidStatus(row.status));
    const unpaidRows = paymentRows.filter(row => !isPaidStatus(row.status));
    const paidAmount = paidRows.reduce((sum, row) => sum + Number(row.amount ?? 0), 0);
    const outstandingAmount = unpaidRows.reduce((sum, row) => sum + Number(row.amount ?? 0), 0);
    const latestPayment = [...paymentRows].sort((a, b) => new Date(b.date ?? b.createdAt ?? 0).getTime() - new Date(a.date ?? a.createdAt ?? 0).getTime())[0];

    return {
        paymentStatus: latestPayment?.status ?? 'pending',
        paidAmount,
        outstandingAmount,
        amountDue: outstandingAmount,
        paymentCurrency: DEFAULT_PAYMENT_CURRENCY,
        paymentTransactions: paymentRows
            .filter(row => isPaidStatus(row.status) || normalizePaymentStatus(row.status) === 'failed' || normalizePaymentStatus(row.status) === 'error')
            .sort((a, b) => new Date(b.date ?? b.createdAt ?? 0).getTime() - new Date(a.date ?? a.createdAt ?? 0).getTime())
            .map(row => ({
                id: String(row.id),
                label: monthName(row.month, row.year),
                amount: Number(row.amount ?? 0),
                currency: DEFAULT_PAYMENT_CURRENCY,
                status: isPaidStatus(row.status) ? 'success' : 'error',
                date: getPaymentDate(row.date ?? row.createdAt),
            })),
    };
}

async function buildRosterRows(req: AuthenticatedRequest, options: { stripForPlayerFacing?: boolean } = {}) {
    const { stripForPlayerFacing = true } = options;
    const isPlayerFacing = isPlayerFacingRole(req);
    let allowedTeamIds = await getAllowedTeamIds(req);

    if (isPlayerFacing) {
        const selfTeamIds = await getSelfTeamIds(req);
        allowedTeamIds = allowedTeamIds === null ? selfTeamIds : allowedTeamIds.filter(id => selfTeamIds.includes(id));
    }

    if (allowedTeamIds !== null && allowedTeamIds.length === 0) return [];

    let allPlayers = await db.select().from(players);
    let membershipRows = await db.select().from(playersToTeams);
    let allTeams = await db.select().from(teams);
    const userRows = await db.select({
        email: users.email,
        clubId: users.clubId,
    }).from(users);

    const clubIdByUserEmail = new Map(
        userRows
            .filter(user => user.clubId != null)
            .map(user => [user.email.trim().toLowerCase(), Number(user.clubId)] as const)
    );

    if (allowedTeamIds !== null) {
        const allowedTeamsSet = new Set(allowedTeamIds);
        const allowedPlayerIds = new Set<number>();
        const clubId = getRequestClubId(req);
        
        allPlayers.forEach(p => {
            if (p.teamId != null && allowedTeamsSet.has(p.teamId)) {
                allowedPlayerIds.add(p.id);
            }

            const playerClubId = p.email ? clubIdByUserEmail.get(p.email.trim().toLowerCase()) : null;
            if (clubId != null && playerClubId === clubId) {
                allowedPlayerIds.add(p.id);
            }
        });
        membershipRows.forEach(m => {
            if (allowedTeamsSet.has(m.teamId)) {
                allowedPlayerIds.add(m.playerId);
            }
        });

        allPlayers = allPlayers.filter(p => allowedPlayerIds.has(p.id));
        membershipRows = membershipRows.filter(m => allowedPlayerIds.has(m.playerId));
        allTeams = allTeams.filter(t => allowedTeamsSet.has(t.id));
    }

    if (!allPlayers.length) return [];

    const playerIds = allPlayers.map(p => p.id);
    
    // Split into chunks if necessary, but Drizzle handles normal arrays
    const attendanceRows = await db.select().from(attendance).where(inArray(attendance.playerId, playerIds));
    const paymentRows = await db.select().from(playerPayments).where(inArray(playerPayments.playerId, playerIds));

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
    for (const row of attendanceRows) {
        const curr = attendanceByPlayer.get(row.playerId) || { present: 0, total: 0 };
        curr.total += 1;
        if (isAttendancePresent(row.status)) {
            curr.present += 1;
        }
        attendanceByPlayer.set(row.playerId, curr);
    }

    const latestPaymentByPlayer = new Map<number, typeof paymentRows[0]>();
    for (const row of paymentRows) {
        const current = latestPaymentByPlayer.get(row.playerId);
        if (!current) {
            latestPaymentByPlayer.set(row.playerId, row);
        } else {
            if (row.year > current.year || (row.year === current.year && row.month > current.month) || (row.year === current.year && row.month === current.month && new Date(row.createdAt ?? 0).getTime() > new Date(current.createdAt ?? 0).getTime())) {
                latestPaymentByPlayer.set(row.playerId, row);
            }
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

        const latestPayment = latestPaymentByPlayer.get(player.id);
        const paymentStatus = latestPayment?.status || 'pending';

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
    return isPlayerFacing && stripForPlayerFacing ? rows.map(toSafeRosterRow) : rows;
}

// Shared by getPlayerById and getMe — callers must already have verified the
// requester is allowed to see this exact player's full (unstripped) record.
async function buildFullPlayerPayload(req: AuthenticatedRequest, player: typeof players.$inferSelect) {
    const rosterRows = await buildRosterRows(req, { stripForPlayerFacing: false });
    const rosterPlayer = rosterRows.find(row => row.id === player.id);
    const paymentSummary = await buildPlayerPaymentSummary(player.id);

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

function computeAttendanceRateFromRecords(records: (typeof attendance.$inferSelect)[]) {
    if (records.length === 0) return null;
    const present = records.filter(record => isAttendancePresent(record.status)).length;
    return Math.round((present / records.length) * 1000) / 10;
}

// "Echipa mea" counts a session the same way the player's own Prezență screen
// does — medical/excused are counted as sessions but not as attended — so the
// two screens can never disagree about the same player's rate. (The club-side
// `isAttendancePresent` above is deliberately more generous; that number is a
// staffing metric, not the player's own record.)
const COUNTED_ATTENDANCE_STATUSES = ['present', 'prezent', 'absent', 'medical', 'excused'];
const ATTENDED_STATUSES = ['present', 'prezent'];

function summarizeOwnAttendance(rows: { status: string | null }[]) {
    const counted = rows.filter(row => COUNTED_ATTENDANCE_STATUSES.includes(String(row.status ?? '').trim().toLowerCase()));
    const present = counted.filter(row => ATTENDED_STATUSES.includes(String(row.status ?? '').trim().toLowerCase())).length;
    return {
        rate: counted.length ? Math.round((present / counted.length) * 100) : null,
        present,
        total: counted.length,
    };
}

function mapTeamEvent(event: typeof events.$inferSelect) {
    return {
        id: event.id,
        type: event.type,
        title: event.title,
        location: event.location ?? null,
        startTime: event.startTime,
        endTime: event.endTime,
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

            const allowedTeamIds = await getAllowedTeamIds(req);
            if (allowedTeamIds !== null && allowedTeamIds.length === 0) return res.json([]);

            const q = query.toLowerCase();
            let allPlayers = await db.select().from(players);
            const userRows = await db.select({
                email: users.email,
                clubId: users.clubId,
            }).from(users);
            const clubIdByUserEmail = new Map(
                userRows
                    .filter(user => user.clubId != null)
                    .map(user => [user.email.trim().toLowerCase(), Number(user.clubId)] as const)
            );
            
            if (allowedTeamIds !== null) {
                const membershipRows = await db.select().from(playersToTeams).where(inArray(playersToTeams.teamId, allowedTeamIds));
                const allowedPlayerIds = new Set(membershipRows.map(m => m.playerId));
                const allowedTeamsSet = new Set(allowedTeamIds);
                const clubId = getRequestClubId(req);

                allPlayers = allPlayers.filter(p => {
                    const playerClubId = p.email ? clubIdByUserEmail.get(p.email.trim().toLowerCase()) : null;
                    return (p.teamId != null && allowedTeamsSet.has(p.teamId)) || allowedPlayerIds.has(p.id) || (clubId != null && playerClubId === clubId);
                });
            }

            const results = allPlayers.filter(player => {
                const haystack = `${player.firstName ?? ''} ${player.lastName ?? ''} ${player.name ?? ''}`.toLowerCase();
                return haystack.includes(q);
            });

            res.json(results);
        } catch (error) {
            console.error('Search players error:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    },

    async getRoster(req: AuthenticatedRequest, res: Response) {
        try {
            const rosterWithData = await buildRosterRows(req);
            res.json(rosterWithData);
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
                });
            }

            const attendanceRows = await db.select().from(attendance).where(inArray(attendance.playerId, rosterPlayerIds));
            const paymentRows = await db.select().from(playerPayments).where(inArray(playerPayments.playerId, rosterPlayerIds));

            const now = new Date();
            const currentStart = new Date(now);
            currentStart.setDate(currentStart.getDate() - 30);
            const previousStart = new Date(currentStart);
            previousStart.setDate(previousStart.getDate() - 30);

            const currentPeriodRecords = attendanceRows.filter(row => {
                const date = row.date ? new Date(row.date) : null;
                return date ? date >= currentStart && date <= now : false;
            });

            const previousPeriodRecords = attendanceRows.filter(row => {
                const date = row.date ? new Date(row.date) : null;
                return date ? date >= previousStart && date < currentStart : false;
            });

            const currentPeriodAttendance = computeAttendanceRateFromRecords(currentPeriodRecords);
            const previousPeriodAttendance = computeAttendanceRateFromRecords(previousPeriodRecords);

            const attendanceDelta = currentPeriodAttendance !== null && previousPeriodAttendance !== null
                ? Math.round((currentPeriodAttendance - previousPeriodAttendance) * 10) / 10
                : null;

            const latestPaymentByPlayer = new Map<number, typeof paymentRows[0]>();
            for (const row of paymentRows) {
                const current = latestPaymentByPlayer.get(row.playerId);
                if (!current) {
                    latestPaymentByPlayer.set(row.playerId, row);
                } else {
                    if (row.year > current.year || (row.year === current.year && row.month > current.month) || (row.year === current.year && row.month === current.month && new Date(row.createdAt ?? 0).getTime() > new Date(current.createdAt ?? 0).getTime())) {
                        latestPaymentByPlayer.set(row.playerId, row);
                    }
                }
            }

            const pendingPlayerIds = rosterPlayerIds.filter(playerId => {
                const latest = latestPaymentByPlayer.get(playerId);
                return !isPaidStatus(latest?.status);
            });

            res.json({
                athleteCount: rosterRows.length,
                averageAttendance,
                currentPeriodAttendance,
                previousPeriodAttendance,
                attendanceDelta,
                pendingPayments: pendingPlayerIds.length,
                pendingPlayerIds,
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
            const rosterRows = await buildRosterRows(req);
            const pendingPlayers = rosterRows.filter(player => !isPaidStatus(player.paymentStatus));

            const reminderRecipients = pendingPlayers.map(player => ({
                id: player.id,
                firstName: player.firstName,
                lastName: player.lastName,
                email: player.email,
                paymentStatus: player.paymentStatus,
            }));

            res.json({
                sent: reminderRecipients.length,
                recipients: reminderRecipients,
                sentAt: new Date().toISOString(),
                provider: 'not-configured',
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
            }

            await db.delete(playersToTeams).where(eq(playersToTeams.playerId, id));
            await db.update(players).set({ teamId: null, status: 'inactive' }).where(eq(players.id, id));

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

            const { playerId, teamId } = req.body;
            if (!playerId || !teamId) return res.status(400).json({ error: 'playerId and teamId required' });

            const allowedTeamIds = await getAllowedTeamIds(req);
            if (allowedTeamIds !== null && !allowedTeamIds.includes(Number(teamId))) {
                return res.status(403).json({ error: 'Cannot add to a team outside your club' });
            }

            const [inserted] = await db.insert(playersToTeams).values({
                playerId: Number(playerId),
                teamId: Number(teamId)
            }).returning();

            await db.update(players).set({ teamId: Number(teamId), status: 'active' }).where(eq(players.id, Number(playerId)));

            res.json(inserted);
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
            }

            const update = buildPlayerUpdate(req.body);
            if (!update.ok) {
                return res.status(400).json({ error: update.error });
            }

            const [updated] = await db.update(players).set(update.data).where(eq(players.id, playerId)).returning();
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
                    if (!await isPlayerAllowedForRequest(req, player)) return res.status(403).json({ error: 'Access denied' });
                }
            }

            res.json(await buildFullPlayerPayload(req, player));
        } catch (error) {
            console.error('Get player by id error:', error);
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
                    .filter(event => new Date(event.startTime).getTime() >= now)
                    .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
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
                .filter(event => new Date(event.startTime).getTime() >= now)
                .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime())
                .slice(0, 10)
                .map(mapTeamEvent);
            const recentEvents = liveEvents
                .filter(event => new Date(event.startTime).getTime() < now)
                .sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime())
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
