import { Router } from 'express';
import { and, count, desc, eq, inArray, isNotNull } from 'drizzle-orm';
import { authenticate, requireSuperadmin, type AuthenticatedRequest } from '../middleware/auth';
import { inviteTtlMinutes } from '../lib/inviteTtl';
import { listAuditLogs, writeAuditLog } from '../services/auditService';
import { publicUser } from '../lib/publicUser';
import {
    accessRequests,
    auditLogs,
    clubs,
    familyJoinRequests,
    invites,
    playerGuardians,
    players,
    playersToTeams,
    teams,
    userActivityMonths,
    users,
} from '../db/schema';
import { db } from '../db';
import { isVisiblePendingInvite } from '../services/invitationsService';
import { activityKeys } from '../lib/activityTracker';
import {
    activeWithin,
    billingForMonth,
    CLUB_ROLES,
    isMonthKey,
    monthlyTrend,
    monthsBack,
    summarizeClubs,
    type MetricActivity,
    type MetricClub,
    type MetricUser,
    utcIso,
} from '../lib/platformMetrics';

/**
 * Platform console for the superadmin role: overview, clubs, accounts and
 * monthly billing. All numbers come from lib/platformMetrics.ts.
 */
const router = Router();

router.use(authenticate, requireSuperadmin);

function actorFields(req: AuthenticatedRequest) {
    return {
        actorUserId: req.user?.id ?? null,
        actorUid: req.firebaseUser?.uid ?? null,
        actorRole: req.user?.role ?? null,
    };
}

function toMetricClub(row: typeof clubs.$inferSelect): MetricClub {
    return {
        id: row.id,
        name: row.name,
        createdAt: row.createdAt,
        stripeAccountId: row.stripeAccountId,
        stripeChargesEnabled: row.stripeChargesEnabled,
        billingPricePerUser: row.billingPricePerUser == null ? null : Number(row.billingPricePerUser),
        internalNotes: row.internalNotes,
    };
}

function toMetricUser(row: typeof users.$inferSelect): MetricUser {
    return {
        id: row.id,
        clubId: row.clubId,
        role: row.role,
        status: row.status,
        lastLoginAt: row.lastLoginAt,
        createdAt: row.createdAt,
    };
}

function currentMonth() {
    return activityKeys(new Date()).month;
}

/** Roster size per club: players whose team (primary or extra) is the club's. */
async function playersByClub() {
    const [primary, extra] = await Promise.all([
        db.select({ playerId: players.id, clubId: teams.clubId })
            .from(players)
            .innerJoin(teams, eq(teams.id, players.teamId)),
        db.select({ playerId: players.id, clubId: teams.clubId })
            .from(playersToTeams)
            .innerJoin(players, eq(players.id, playersToTeams.playerId))
            .innerJoin(teams, eq(teams.id, playersToTeams.teamId)),
    ]);
    const sets = new Map<number, Set<number>>();
    for (const row of [...primary, ...extra]) {
        if (row.clubId == null) continue;
        const set = sets.get(row.clubId) ?? new Set<number>();
        set.add(row.playerId);
        sets.set(row.clubId, set);
    }
    return new Map([...sets].map(([clubId, set]) => [clubId, set.size] as const));
}

async function teamsByClub() {
    const rows = await db.select({ clubId: teams.clubId, value: count() })
        .from(teams)
        .where(eq(teams.isActive, true))
        .groupBy(teams.clubId);
    return new Map(rows.filter((row) => row.clubId != null).map((row) => [row.clubId!, Number(row.value)] as const));
}

async function loadActivity(months: string[]): Promise<MetricActivity[]> {
    if (months.length === 0) return [];
    const rows = await db.select({
        userId: userActivityMonths.userId,
        clubId: userActivityMonths.clubId,
        role: userActivityMonths.role,
        month: userActivityMonths.month,
        activeDays: userActivityMonths.activeDays,
        lastSeenAt: userActivityMonths.lastSeenAt,
    }).from(userActivityMonths).where(inArray(userActivityMonths.month, months));
    return rows;
}

async function trackingSince() {
    const [row] = await db.select({ month: userActivityMonths.month })
        .from(userActivityMonths)
        .orderBy(userActivityMonths.month)
        .limit(1);
    return row?.month ?? null;
}

/** Everything a club list or the overview needs, loaded once. */
async function loadPlatform(months: string[]) {
    const [clubRows, userRows, inviteRows, teamCounts, playerCounts, activity] = await Promise.all([
        db.select().from(clubs).orderBy(clubs.name),
        db.select().from(users),
        db.select().from(invites).where(eq(invites.status, 'pending')),
        teamsByClub(),
        playersByClub(),
        loadActivity(months),
    ]);

    const pendingInvitesByClub = new Map<number, number>();
    const visibleInvites = inviteRows.filter((invite) => isVisiblePendingInvite(invite, userRows));
    for (const invite of visibleInvites) {
        if (invite.clubId == null) continue;
        pendingInvitesByClub.set(invite.clubId, (pendingInvitesByClub.get(invite.clubId) ?? 0) + 1);
    }

    return {
        clubRows,
        userRows,
        visibleInvites,
        metricClubs: clubRows.map(toMetricClub),
        metricUsers: userRows.map(toMetricUser),
        teamCounts,
        playerCounts,
        pendingInvitesByClub,
        activity,
    };
}

function sendError(res: import('express').Response, status: number, error: string) {
    return res.status(status).json({ error });
}

/* ───────────────────────────── Overview ───────────────────────────── */

router.get('/overview', async (_req, res) => {
    try {
        const month = currentMonth();
        const months = monthsBack(month, 6);
        const now = Date.now();
        const platform = await loadPlatform(months);
        const [pendingAccess, pendingFamily, auditRows, since] = await Promise.all([
            db.select({ value: count() }).from(accessRequests).where(eq(accessRequests.status, 'pending')),
            db.select({ value: count() }).from(familyJoinRequests).where(eq(familyJoinRequests.status, 'pending')),
            db.select().from(auditLogs).orderBy(desc(auditLogs.createdAt)).limit(8),
            trackingSince(),
        ]);

        const summaries = summarizeClubs({
            clubs: platform.metricClubs,
            users: platform.metricUsers,
            activity: platform.activity,
            month,
            teamsByClub: platform.teamCounts,
            playersByClub: platform.playerCounts,
            pendingInvitesByClub: platform.pendingInvitesByClub,
            now,
        });
        const trend = monthlyTrend({ clubs: platform.metricClubs, users: platform.metricUsers, activity: platform.activity, months });
        const people = platform.metricUsers.filter((user) => user.role !== 'superadmin');
        const live = people.filter((user) => user.status !== 'disabled');
        const clubNames = new Map(platform.clubRows.map((club) => [club.id, club.name] as const));

        const roles = Object.fromEntries(CLUB_ROLES.map((role) => [role, live.filter((user) => user.role === role).length]));
        const createdWithin = (from: number, to: number) => people.filter((user) => {
            const time = Date.parse(`${String(user.createdAt).replace(' ', 'T')}Z`);
            return now - time <= from && now - time > to;
        }).length;
        const DAY = 24 * 60 * 60 * 1000;

        const attention: Array<{ kind: string; clubId?: number; clubName?: string; count?: number }> = [];
        const pendingRequests = Number(pendingAccess[0]?.value ?? 0) + Number(pendingFamily[0]?.value ?? 0);
        if (pendingRequests > 0) attention.push({ kind: 'pendingRequests', count: pendingRequests });
        for (const club of summaries) {
            if (club.flags.noAdmin) attention.push({ kind: 'noAdmin', clubId: club.id, clubName: club.name });
            else if (club.flags.dormant) attention.push({ kind: 'dormant', clubId: club.id, clubName: club.name });
            if (club.flags.unpriced && club.activeThisMonth > 0) {
                attention.push({ kind: 'unpriced', clubId: club.id, clubName: club.name, count: club.activeThisMonth });
            }
        }

        res.json({
            success: true,
            month,
            trackingSince: since,
            totals: {
                clubs: platform.clubRows.length,
                accounts: people.length,
                activeAccounts: people.filter((user) => user.status === 'active').length,
                pendingAccounts: people.filter((user) => user.status === 'pending').length,
                disabledAccounts: people.filter((user) => user.status === 'disabled').length,
                teams: [...platform.teamCounts.values()].reduce((sum, value) => sum + value, 0),
                rosterPlayers: [...platform.playerCounts.values()].reduce((sum, value) => sum + value, 0),
                pendingInvites: platform.visibleInvites.length,
                pendingRequests,
            },
            activity: {
                today: live.filter((user) => activeWithin(user, 1, now)).length,
                last7d: live.filter((user) => activeWithin(user, 7, now)).length,
                last30d: live.filter((user) => activeWithin(user, 30, now)).length,
                thisMonth: trend[trend.length - 1]?.activeUsers ?? 0,
                lastMonth: trend[trend.length - 2]?.activeUsers ?? 0,
            },
            newAccounts: { last30d: createdWithin(30 * DAY, -1), prev30d: createdWithin(60 * DAY, 30 * DAY) },
            revenue: {
                thisMonth: trend[trend.length - 1]?.amount ?? null,
                lastMonth: trend[trend.length - 2]?.amount ?? null,
            },
            roles,
            trend,
            topClubs: [...summaries].sort((a, b) => b.activeThisMonth - a.activeThisMonth || b.accounts.total - a.accounts.total).slice(0, 6),
            attention: attention.slice(0, 8),
            recentAudit: auditRows.map((row) => ({
                id: row.id,
                action: row.action,
                createdAt: utcIso(row.createdAt),
                clubName: row.clubId == null ? null : clubNames.get(row.clubId) ?? null,
                metadata: row.metadata,
            })),
        });
    } catch (error) {
        console.error('Super admin overview error:', error);
        sendError(res, 500, 'Nu am putut încărca privirea de ansamblu.');
    }
});

/* ─────────────────────────────── Clubs ─────────────────────────────── */

router.get('/clubs', async (_req, res) => {
    try {
        const month = currentMonth();
        const platform = await loadPlatform([month]);
        const data = summarizeClubs({
            clubs: platform.metricClubs,
            users: platform.metricUsers,
            activity: platform.activity,
            month,
            teamsByClub: platform.teamCounts,
            playersByClub: platform.playerCounts,
            pendingInvitesByClub: platform.pendingInvitesByClub,
            now: Date.now(),
        });
        res.json({ success: true, month, clubs: data });
    } catch (error) {
        console.error('List clubs error:', error);
        sendError(res, 500, 'Nu am putut încărca cluburile.');
    }
});

function normalizeClubName(value: unknown) {
    return String(value ?? '').trim().replace(/\s+/g, ' ');
}

router.post('/clubs', async (req: AuthenticatedRequest, res) => {
    try {
        const name = normalizeClubName(req.body?.name);
        if (!name) return sendError(res, 400, 'Numele clubului este obligatoriu.');
        if (name.length > 120) return sendError(res, 400, 'Numele clubului este prea lung.');

        const normalizedName = name.toLowerCase();
        const existing = await db.select({ id: clubs.id }).from(clubs).where(eq(clubs.normalizedName, normalizedName)).limit(1);
        if (existing[0]) return sendError(res, 409, 'Există deja un club cu acest nume.');

        const [inserted] = await db.insert(clubs).values({
            name,
            normalizedName,
            createdBy: req.user?.id == null ? null : String(req.user.id),
        }).returning();

        await writeAuditLog({
            action: 'club.created',
            entityType: 'club',
            entityId: inserted.id,
            ...actorFields(req),
            clubId: inserted.id,
            metadata: { name },
        });

        const [summary] = summarizeClubs({
            clubs: [toMetricClub(inserted)],
            users: [],
            activity: [],
            month: currentMonth(),
            teamsByClub: new Map(),
            playersByClub: new Map(),
            pendingInvitesByClub: new Map(),
            now: Date.now(),
        });
        res.status(201).json({ success: true, club: summary });
    } catch (error) {
        console.error('Create club error:', error);
        sendError(res, 500, 'Nu am putut crea clubul.');
    }
});

function parseId(value: unknown) {
    const id = Number(value);
    return Number.isInteger(id) && id > 0 ? id : null;
}

router.get('/clubs/:id', async (req, res) => {
    try {
        const clubId = parseId(req.params.id);
        if (clubId == null) return sendError(res, 400, 'Club invalid.');

        const month = currentMonth();
        const months = monthsBack(month, 6);
        const platform = await loadPlatform(months);
        const club = platform.clubRows.find((row) => row.id === clubId);
        if (!club) return sendError(res, 404, 'Clubul nu există.');

        const [summary] = summarizeClubs({
            clubs: [toMetricClub(club)],
            users: platform.metricUsers,
            activity: platform.activity,
            month,
            teamsByClub: platform.teamCounts,
            playersByClub: platform.playerCounts,
            pendingInvitesByClub: platform.pendingInvitesByClub,
            now: Date.now(),
        });

        const teamRows = await db.select({
            id: teams.id,
            name: teams.name,
            seasonName: teams.seasonName,
            leagueName: teams.leagueName,
            isActive: teams.isActive,
            coachId: teams.coachId,
        }).from(teams).where(eq(teams.clubId, clubId)).orderBy(teams.name);
        const teamIds = teamRows.map((team) => team.id);
        const teamPlayers = teamIds.length
            ? await db.select({ teamId: players.teamId, value: count() }).from(players).where(inArray(players.teamId, teamIds)).groupBy(players.teamId)
            : [];
        const playersPerTeam = new Map(teamPlayers.map((row) => [row.teamId, Number(row.value)] as const));
        const names = new Map(platform.userRows.map((user) => [user.id, user.name] as const));

        const daysThisMonth = new Map(platform.activity
            .filter((row) => row.month === month)
            .map((row) => [row.userId, row.activeDays] as const));

        const members = platform.userRows
            .filter((user) => user.clubId === clubId && user.role !== 'superadmin')
            .map((user) => ({
                ...publicUser(user),
                createdAt: utcIso(user.createdAt),
                lastLoginAt: utcIso(user.lastLoginAt),
                activeDaysThisMonth: daysThisMonth.get(user.id) ?? 0,
            }))
            .sort((a, b) => String(b.lastLoginAt ?? '').localeCompare(String(a.lastLoginAt ?? '')) || a.name.localeCompare(b.name));

        res.json({
            success: true,
            month,
            club: summary,
            members,
            invites: platform.visibleInvites
                .filter((invite) => invite.clubId === clubId)
                .map((invite) => ({ id: invite.id, email: invite.email, role: invite.role, createdAt: utcIso(invite.createdAt), expiresAt: utcIso(invite.expiresAt) })),
            teams: teamRows.map((team) => ({
                ...team,
                coachName: team.coachId == null ? null : names.get(team.coachId) ?? null,
                players: playersPerTeam.get(team.id) ?? 0,
            })),
            trend: monthlyTrend({ clubs: platform.metricClubs, users: platform.metricUsers, activity: platform.activity, months, clubId }),
        });
    } catch (error) {
        console.error('Club detail error:', error);
        sendError(res, 500, 'Nu am putut încărca clubul.');
    }
});

router.patch('/clubs/:id', async (req: AuthenticatedRequest, res) => {
    try {
        const clubId = parseId(req.params.id);
        if (clubId == null) return sendError(res, 400, 'Club invalid.');

        const patch: Partial<typeof clubs.$inferInsert> = {};
        if (req.body?.name !== undefined) {
            const name = normalizeClubName(req.body.name);
            if (!name) return sendError(res, 400, 'Numele clubului este obligatoriu.');
            if (name.length > 120) return sendError(res, 400, 'Numele clubului este prea lung.');
            const clash = await db.select({ id: clubs.id }).from(clubs).where(eq(clubs.normalizedName, name.toLowerCase())).limit(1);
            if (clash[0] && clash[0].id !== clubId) return sendError(res, 409, 'Există deja un club cu acest nume.');
            patch.name = name;
            patch.normalizedName = name.toLowerCase();
        }
        if (req.body?.billingPricePerUser !== undefined) {
            const raw = req.body.billingPricePerUser;
            if (raw === null || raw === '') {
                patch.billingPricePerUser = null;
            } else {
                const price = Number(String(raw).replace(',', '.'));
                if (!Number.isFinite(price) || price < 0 || price > 100000) return sendError(res, 400, 'Preț invalid.');
                patch.billingPricePerUser = Math.round(price * 100) / 100;
            }
        }
        if (req.body?.internalNotes !== undefined) {
            const notes = req.body.internalNotes == null ? '' : String(req.body.internalNotes).trim();
            if (notes.length > 4000) return sendError(res, 400, 'Notițele sunt prea lungi.');
            patch.internalNotes = notes || null;
        }
        if (Object.keys(patch).length === 0) return sendError(res, 400, 'Nimic de salvat.');

        const [updated] = await db.update(clubs)
            .set({ ...patch, updatedAt: new Date().toISOString() })
            .where(eq(clubs.id, clubId))
            .returning();
        if (!updated) return sendError(res, 404, 'Clubul nu există.');

        await writeAuditLog({
            action: 'club.updated',
            entityType: 'club',
            entityId: clubId,
            ...actorFields(req),
            clubId,
            // Notes are private: log that they changed, not what they say.
            metadata: {
                ...(patch.name ? { name: patch.name } : {}),
                ...(patch.billingPricePerUser !== undefined ? { billingPricePerUser: patch.billingPricePerUser } : {}),
                ...(patch.internalNotes !== undefined ? { internalNotes: 'updated' } : {}),
            },
        });

        res.json({ success: true, club: toMetricClub(updated) });
    } catch (error) {
        console.error('Update club error:', error);
        sendError(res, 500, 'Nu am putut salva clubul.');
    }
});

/* ─────────────────────────────── Users ─────────────────────────────── */

router.get('/users', async (_req, res) => {
    try {
        const month = currentMonth();
        const platform = await loadPlatform([month]);
        const clubNames = new Map(platform.clubRows.map((club) => [club.id, club.name] as const));
        const daysThisMonth = new Map(platform.activity.map((row) => [row.userId, row.activeDays] as const));

        const pendingInvites = platform.visibleInvites.map((invite) => ({
            id: `invite-${invite.id}`,
            email: invite.email,
            name: invite.email.split('@')[0],
            role: invite.role,
            status: 'invited',
            clubId: invite.clubId,
            clubName: invite.clubId == null ? null : clubNames.get(invite.clubId) ?? null,
            createdAt: utcIso(invite.createdAt),
            lastLoginAt: null,
            activeDaysThisMonth: 0,
            source: 'invite',
        }));

        // Never ship credentials or external ids to the browser.
        const accounts = platform.userRows.map((row) => {
            const user = publicUser(row);
            return {
                id: user.id,
                email: user.email,
                name: user.name,
                phone: user.phone,
                role: user.role,
                status: user.status,
                clubId: user.clubId,
                clubName: user.clubId == null ? null : clubNames.get(user.clubId) ?? null,
                createdAt: utcIso(row.createdAt),
                lastLoginAt: utcIso(row.lastLoginAt),
                activeDaysThisMonth: daysThisMonth.get(row.id) ?? 0,
                source: 'user',
            };
        });

        res.json({
            success: true,
            month,
            users: [...pendingInvites, ...accounts].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))),
        });
    } catch (error) {
        console.error('List users error:', error);
        sendError(res, 500, 'Nu am putut încărca utilizatorii.');
    }
});

const ASSIGNABLE_ROLES = new Set<string>(CLUB_ROLES);
const USER_STATUSES = new Set(['active', 'pending', 'disabled']);

/**
 * Accounts still tied to their club's data: moving them would leave a parent
 * linked to another club's child or a coach on another club's team.
 */
async function clubTies(userId: number) {
    const [guardianLinks, ownPlayer, coachedTeams] = await Promise.all([
        db.select({ value: count() }).from(playerGuardians).where(eq(playerGuardians.userId, userId)),
        db.select({ value: count() }).from(players).where(eq(players.userId, userId)),
        db.select({ value: count() }).from(teams).where(eq(teams.coachId, userId)),
    ]);
    return {
        children: Number(guardianLinks[0]?.value ?? 0),
        playerProfile: Number(ownPlayer[0]?.value ?? 0),
        teams: Number(coachedTeams[0]?.value ?? 0),
    };
}

router.patch('/users/:id', async (req: AuthenticatedRequest, res) => {
    try {
        const id = parseId(req.params.id);
        if (id == null) return sendError(res, 400, 'Utilizator invalid.');

        const [target] = await db.select().from(users).where(eq(users.id, id)).limit(1);
        if (!target) return sendError(res, 404, 'Utilizatorul nu există.');

        const patch: Partial<typeof users.$inferInsert> = {};
        if (typeof req.body?.name === 'string') {
            const name = req.body.name.trim().replace(/\s+/g, ' ');
            if (!name) return sendError(res, 400, 'Numele este obligatoriu.');
            patch.name = name;
        }

        const changesAccess = req.body?.role !== undefined || req.body?.status !== undefined || req.body?.clubId !== undefined;
        if (changesAccess) {
            if (target.id === req.user?.id) return sendError(res, 403, 'Nu îți poți schimba propriul rol, club sau stare.');
            if (target.role === 'superadmin') return sendError(res, 403, 'Conturile de super admin nu se modifică de aici.');
        }

        if (req.body?.role !== undefined) {
            const nextRole = String(req.body.role);
            if (!ASSIGNABLE_ROLES.has(nextRole)) return sendError(res, 400, 'Rol invalid.');
            patch.role = nextRole as typeof users.$inferInsert['role'];
        }
        if (req.body?.status !== undefined) {
            const nextStatus = String(req.body.status);
            if (!USER_STATUSES.has(nextStatus)) return sendError(res, 400, 'Stare invalidă.');
            patch.status = nextStatus as typeof users.$inferInsert['status'];
        }
        if (req.body?.clubId !== undefined) {
            const nextClubId = parseId(req.body.clubId);
            if (nextClubId == null) return sendError(res, 400, 'Club invalid.');
            if (nextClubId !== target.clubId) {
                const [club] = await db.select({ id: clubs.id }).from(clubs).where(eq(clubs.id, nextClubId)).limit(1);
                if (!club) return sendError(res, 404, 'Clubul nu există.');
                const ties = await clubTies(id);
                if (ties.children || ties.playerProfile || ties.teams) {
                    const reasons = [
                        ties.children ? `${ties.children} ${ties.children === 1 ? 'copil legat' : 'copii legați'}` : null,
                        ties.playerProfile ? 'profil de jucător' : null,
                        ties.teams ? `${ties.teams} ${ties.teams === 1 ? 'echipă antrenată' : 'echipe antrenate'}` : null,
                    ].filter(Boolean).join(', ');
                    return sendError(res, 409, `Contul are încă date în clubul actual (${reasons}). Scoate-le întâi din club, apoi mută contul.`);
                }
                patch.clubId = nextClubId;
            }
        }

        if (Object.keys(patch).length === 0) return sendError(res, 400, 'Nimic de salvat.');

        const [updated] = await db.update(users)
            .set({ ...patch, updatedAt: new Date().toISOString() })
            .where(eq(users.id, id))
            .returning();

        await writeAuditLog({
            action: patch.status === 'disabled' ? 'user.deactivated' : patch.status === 'active' && target.status === 'disabled' ? 'user.reactivated' : 'user.updated',
            entityType: 'user',
            entityId: id,
            ...actorFields(req),
            clubId: updated.clubId ?? null,
            metadata: {
                email: target.email,
                ...(patch.role ? { nextRole: patch.role, previousRole: target.role } : {}),
                ...(patch.status ? { nextStatus: patch.status, previousStatus: target.status } : {}),
                ...(patch.clubId ? { nextClubId: patch.clubId, previousClubId: target.clubId } : {}),
                ...(patch.name ? { name: patch.name } : {}),
            },
        });

        res.json({ success: true, user: publicUser(updated) });
    } catch (error) {
        console.error('Update user error:', error);
        sendError(res, 500, 'Nu am putut salva utilizatorul.');
    }
});

router.post('/invites/:id/revoke', async (req: AuthenticatedRequest, res) => {
    try {
        const inviteId = parseId(String(req.params.id).replace(/^invite-/, ''));
        if (inviteId == null) return sendError(res, 400, 'Invitație invalidă.');

        const [invite] = await db.select().from(invites).where(eq(invites.id, inviteId)).limit(1);
        if (!invite) return sendError(res, 404, 'Invitația nu există.');
        if (invite.status !== 'pending') return sendError(res, 409, 'Invitația nu mai este activă.');

        await db.update(invites).set({ status: 'revoked' }).where(and(eq(invites.id, inviteId), eq(invites.status, 'pending')));
        await writeAuditLog({
            action: 'invitation.revoked',
            entityType: 'invitation',
            entityId: inviteId,
            ...actorFields(req),
            clubId: invite.clubId ?? null,
            metadata: { email: invite.email, role: invite.role, status: 'revoked' },
        });

        res.json({ success: true });
    } catch (error) {
        console.error('Revoke invite error:', error);
        sendError(res, 500, 'Nu am putut revoca invitația.');
    }
});

/* ────────────────────────────── Billing ────────────────────────────── */

router.get('/billing', async (req, res) => {
    try {
        const thisMonth = currentMonth();
        const month = isMonthKey(req.query.month) && req.query.month <= thisMonth ? req.query.month : thisMonth;
        const [clubRows, activity, since, accountRows] = await Promise.all([
            db.select().from(clubs).orderBy(clubs.name),
            loadActivity([month]),
            trackingSince(),
            db.select({ clubId: users.clubId, value: count() })
                .from(users)
                .where(and(eq(users.status, 'active'), isNotNull(users.clubId)))
                .groupBy(users.clubId),
        ]);
        const activeAccounts = new Map(accountRows.map((row) => [row.clubId!, Number(row.value)] as const));
        const rows = billingForMonth(clubRows.map(toMetricClub), activity, month).map((row) => ({
            ...row,
            activeAccounts: activeAccounts.get(row.clubId) ?? 0,
        }));
        const priced = rows.filter((row) => row.amount != null);

        res.json({
            success: true,
            month,
            currentMonth: thisMonth,
            trackingSince: since,
            months: monthsBack(thisMonth, 12).reverse(),
            clubs: rows,
            totals: {
                billableUsers: rows.reduce((sum, row) => sum + row.billableUsers, 0),
                amount: Math.round(priced.reduce((sum, row) => sum + (row.amount ?? 0), 0) * 100) / 100,
                pricedClubs: priced.length,
                unpricedClubs: rows.filter((row) => row.amount == null && row.billableUsers > 0).length,
            },
        });
    } catch (error) {
        console.error('Billing error:', error);
        sendError(res, 500, 'Nu am putut încărca facturarea.');
    }
});

/** The accounts behind one club's invoice line — the detail for a CSV/annex. */
router.get('/billing/:clubId', async (req, res) => {
    try {
        const clubId = parseId(req.params.clubId);
        if (clubId == null) return sendError(res, 400, 'Club invalid.');
        const month = isMonthKey(req.query.month) ? req.query.month : currentMonth();

        const rows = await db.select({
            userId: userActivityMonths.userId,
            role: userActivityMonths.role,
            activeDays: userActivityMonths.activeDays,
            firstSeenAt: userActivityMonths.firstSeenAt,
            lastSeenAt: userActivityMonths.lastSeenAt,
            name: users.name,
            email: users.email,
        })
            .from(userActivityMonths)
            .innerJoin(users, eq(users.id, userActivityMonths.userId))
            .where(and(eq(userActivityMonths.clubId, clubId), eq(userActivityMonths.month, month)))
            .orderBy(users.name);

        res.json({
            success: true,
            month,
            users: rows
                .filter((row) => row.role !== 'superadmin')
                .map((row) => ({ ...row, firstSeenAt: utcIso(row.firstSeenAt), lastSeenAt: utcIso(row.lastSeenAt) })),
        });
    } catch (error) {
        console.error('Billing detail error:', error);
        sendError(res, 500, 'Nu am putut încărca detaliile.');
    }
});

/* ─────────────────────────── Audit & settings ─────────────────────────── */

router.get('/audit-logs', async (req, res) => {
    try {
        const clubId = Number(req.query.clubId);
        const actorUserId = Number(req.query.actorUserId);
        const result = await listAuditLogs({
            clubId: Number.isInteger(clubId) && clubId > 0 ? clubId : null,
            page: Number(req.query.page) || 1,
            pageSize: Number(req.query.pageSize) || 50,
            category: typeof req.query.category === 'string' ? req.query.category : null,
            actorUserId: Number.isInteger(actorUserId) && actorUserId > 0 ? actorUserId : null,
        });
        res.json({ success: true, ...result });
    } catch (error) {
        console.error('Audit logs error:', error);
        sendError(res, 500, 'Nu am putut încărca jurnalul.');
    }
});

router.get('/settings', async (_req, res) => {
    try {
        const since = await trackingSince().catch(() => null);
        res.json({
            success: true,
            settings: {
                inviteTtlHours: Math.round(inviteTtlMinutes(process.env) / 60),
                resendFromEmail: process.env.RESEND_FROM_EMAIL ?? 'BCMS <no-reply@bcms.ro>',
                appBaseUrl: process.env.APP_BASE_URL ?? process.env.FRONTEND_URL ?? 'https://bcms.ro',
                emailConfigured: Boolean(process.env.RESEND_API_KEY),
                stripeConfigured: Boolean(process.env.STRIPE_SECRET_KEY),
                activityTrackingSince: since,
            },
        });
    } catch (error) {
        console.error('Settings error:', error);
        sendError(res, 500, 'Nu am putut încărca setările.');
    }
});

export default router;
