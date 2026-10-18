import { Router } from 'express';
import { alias } from 'drizzle-orm/pg-core';
import { and, asc, desc, eq, inArray, or, type SQL } from 'drizzle-orm';
import { db } from '../db';
import {
    accessRequests,
    attendance,
    clubs,
    legalAcceptances,
    notifications,
    playerPayments,
    privacyRequests,
    teams,
    users,
    playersToTeams,
} from '../db/schema';
import { authenticate } from '../middleware/auth';
import { rateLimit } from '../middleware/rateLimit';
import { requireRequestUser } from '../lib/requestContext';
import { LEGAL_VERSION, stripHiddenUserFields } from '../lib/legal';
import { guardianChildren, resolveSelfPlayer } from '../lib/selfPlayer';
import { writeAuditLog } from '../services/auditService';
import { sendNotificationEmails } from '../lib/mailer';
import { parseResolveInput, privacyDaysLeft, privacyDueAt, privacyRequestsPath } from '../lib/privacyRequests';

const router = Router();
router.use(authenticate);

const exportLimiter = rateLimit({ bucket: 'privacy:export', limit: 5, windowMs: 60 * 60_000 });
const writeLimiter = rateLimit({ bucket: 'privacy:write', limit: 20, windowMs: 60 * 60_000 });

async function hasAccepted(userId: number) {
    const [row] = await db.select({ id: legalAcceptances.id }).from(legalAcceptances)
        .where(and(eq(legalAcceptances.userId, userId), eq(legalAcceptances.version, LEGAL_VERSION)))
        .limit(1);
    return Boolean(row);
}

async function openErasureRequest(userId: number) {
    const [row] = await db.select({ id: privacyRequests.id, createdAt: privacyRequests.createdAt }).from(privacyRequests)
        .where(and(eq(privacyRequests.userId, userId), eq(privacyRequests.type, 'erasure'), eq(privacyRequests.status, 'open')))
        .limit(1);
    return row ?? null;
}

// GET /api/privacy/status — drives the acceptance prompt and the profile card.
router.get('/status', async (req, res) => {
    try {
        const user = await requireRequestUser(req, res);
        if (!user) return;
        const [accepted, erasure] = await Promise.all([hasAccepted(user.id), openErasureRequest(user.id)]);
        res.json({ version: LEGAL_VERSION, accepted, erasureRequestedAt: erasure?.createdAt ?? null });
    } catch (error) {
        console.error('[privacy] status failed:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// POST /api/privacy/accept { version } — a person agreeing to the current Terms and Privacy Policy.
router.post('/accept', writeLimiter, async (req, res) => {
    try {
        const user = await requireRequestUser(req, res);
        if (!user) return;
        if (String(req.body?.version ?? '') !== LEGAL_VERSION) {
            return res.status(409).json({ error: 'Termenii s-au actualizat. Reîncarcă pagina și încearcă din nou.', version: LEGAL_VERSION });
        }
        await db.insert(legalAcceptances).values({ userId: user.id, version: LEGAL_VERSION }).onConflictDoNothing();
        res.json({ version: LEGAL_VERSION, accepted: true });
    } catch (error) {
        console.error('[privacy] accept failed:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// GET /api/privacy/export — everything the app holds about the caller (and, for a parent, their children).
router.get('/export', exportLimiter, async (req, res) => {
    try {
        const caller = await requireRequestUser(req, res);
        if (!caller) return;

        const [account] = await db.select().from(users).where(eq(users.id, caller.id)).limit(1);
        if (!account) return res.status(404).json({ error: 'Contul nu a fost găsit.' });

        const linkedPlayers = caller.role === 'parent'
            ? await guardianChildren(caller.id)
            : await resolveSelfPlayer({ id: caller.id, role: caller.role, email: caller.email }).then((row) => (row ? [row] : []));
        const playerIds = linkedPlayers.map((player) => player.id);

        const [teamRows, attendanceRows, paymentRows, notificationRows, acceptanceRows, requestRows, accessRows] = await Promise.all([
            playerIds.length
                ? db.select({ playerId: playersToTeams.playerId, team: teams.name }).from(playersToTeams)
                    .innerJoin(teams, eq(teams.id, playersToTeams.teamId)).where(inArray(playersToTeams.playerId, playerIds))
                : [],
            playerIds.length ? db.select().from(attendance).where(inArray(attendance.playerId, playerIds)) : [],
            playerIds.length
                ? db.select().from(playerPayments).where(inArray(playerPayments.playerId, playerIds))
                : db.select().from(playerPayments).where(eq(playerPayments.paidByUserId, caller.id)),
            db.select().from(notifications).where(eq(notifications.userId, caller.id)).orderBy(desc(notifications.createdAt)),
            db.select().from(legalAcceptances).where(eq(legalAcceptances.userId, caller.id)),
            db.select().from(privacyRequests).where(eq(privacyRequests.userId, caller.id)),
            db.select().from(accessRequests).where(eq(accessRequests.userId, caller.id)),
        ]);

        const stamp = new Date().toISOString();
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="bcms-datele-mele-${stamp.slice(0, 10)}.json"`);
        res.setHeader('Cache-Control', 'no-store');
        res.send(JSON.stringify({
            exportedAt: stamp,
            account: stripHiddenUserFields(account),
            players: linkedPlayers.map((player) => ({
                ...player,
                teams: teamRows.filter((row) => row.playerId === player.id).map((row) => row.team),
            })),
            attendance: attendanceRows,
            payments: paymentRows,
            notifications: notificationRows,
            legalAcceptances: acceptanceRows,
            privacyRequests: requestRows,
            accessRequests: accessRows,
        }, null, 2));

        void writeAuditLog({
            action: 'privacy.export', entityType: 'user', entityId: caller.id,
            actorUserId: caller.id, actorRole: caller.role, clubId: caller.clubId, ipAddress: req.ip ?? null,
        });
    } catch (error) {
        console.error('[privacy] export failed:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// POST /api/privacy/erasure-request — "delete my data". Recorded and passed to
// whoever answers for the club (or the platform when the account has no club).
router.post('/erasure-request', writeLimiter, async (req, res) => {
    try {
        const caller = await requireRequestUser(req, res);
        if (!caller) return;

        const existing = await openErasureRequest(caller.id);
        if (existing) return res.json({ requested: true, alreadyOpen: true, requestedAt: existing.createdAt });

        const [created] = await db.insert(privacyRequests).values({
            userId: caller.id, clubId: caller.clubId, type: 'erasure', requesterEmail: caller.email,
        }).onConflictDoNothing().returning();

        if (created) {
            const responders = await db.select({ id: users.id, role: users.role }).from(users).where(and(
                eq(users.status, 'active'),
                caller.clubId != null
                    ? or(and(eq(users.role, 'admin'), eq(users.clubId, caller.clubId)), eq(users.role, 'superadmin'))
                    : eq(users.role, 'superadmin'),
            ));
            const title = 'Cerere de ștergere a datelor';
            const message = `${caller.name || caller.email} (${caller.email}) a cerut ștergerea contului și a datelor personale. Răspunde în cel mult 30 de zile.`;
            if (responders.length) {
                await db.insert(notifications).values(responders.map((row) => ({ userId: row.id, type: 'privacy_request', title, message })));
                // The link opens the list where the request can be closed (it used
                // to point at /admin/users, which does not show it — R3-13).
                void sendNotificationEmails(responders.map((row) => ({ userId: row.id, subject: title, title, body: message, path: privacyRequestsPath(row.role) })));
            }
            void writeAuditLog({
                action: 'privacy.erasure_requested', entityType: 'user', entityId: caller.id,
                actorUserId: caller.id, actorRole: caller.role, clubId: caller.clubId, ipAddress: req.ip ?? null,
            });
        }
        res.status(201).json({ requested: true, alreadyOpen: false, requestedAt: created?.createdAt ?? new Date().toISOString() });
    } catch (error) {
        console.error('[privacy] erasure request failed:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// ── Answering requests (club admins: their club; super admins: everyone) ──

const closer = alias(users, 'privacy_closer');

function canAnswer(role: string) {
    return role === 'admin' || role === 'superadmin';
}

/**
 * GET /api/privacy/requests?status=open|closed|all — the GDPR requests the
 * caller answers for, open ones oldest first (the nearest deadline on top),
 * each with its 30-day deadline.
 */
router.get('/requests', async (req, res) => {
    try {
        const caller = await requireRequestUser(req, res);
        if (!caller) return;
        if (!canAnswer(caller.role)) return res.status(403).json({ error: 'Doar administratorii clubului văd aceste cereri.' });
        if (caller.role !== 'superadmin' && caller.clubId == null) return res.json([]);

        const status = String(req.query.status ?? 'open');
        const filters: SQL[] = [];
        if (caller.role !== 'superadmin') filters.push(eq(privacyRequests.clubId, caller.clubId!));
        if (status === 'open') filters.push(eq(privacyRequests.status, 'open'));
        else if (status === 'closed') filters.push(eq(privacyRequests.status, 'resolved'));

        const rows = await db.select({
            request: privacyRequests,
            userName: users.name,
            userEmail: users.email,
            userRole: users.role,
            userStatus: users.status,
            clubName: clubs.name,
            closerName: closer.name,
        })
            .from(privacyRequests)
            .leftJoin(users, eq(users.id, privacyRequests.userId))
            .leftJoin(clubs, eq(clubs.id, privacyRequests.clubId))
            .leftJoin(closer, eq(closer.id, privacyRequests.closedBy))
            .where(filters.length ? and(...filters) : undefined)
            .orderBy(status === 'open' ? asc(privacyRequests.createdAt) : desc(privacyRequests.createdAt))
            .limit(200);

        const now = new Date();
        res.json(rows.map(({ request, userName, userEmail, userRole, userStatus, clubName, closerName }) => {
            const daysLeft = request.status === 'open' ? privacyDaysLeft(request.createdAt, now) : null;
            return {
                id: request.id,
                type: request.type,
                status: request.status,
                createdAt: request.createdAt,
                dueAt: privacyDueAt(request.createdAt)?.toISOString() ?? null,
                daysLeft,
                overdue: daysLeft != null && daysLeft < 0,
                closedAt: request.closedAt,
                resolutionNote: request.resolutionNote,
                closedBy: request.closedBy != null ? { id: request.closedBy, name: closerName ?? null } : null,
                requester: {
                    id: request.userId,
                    name: userName ?? null,
                    email: userEmail ?? request.requesterEmail ?? null,
                    role: userRole ?? null,
                    status: userStatus ?? null,
                },
                club: request.clubId != null ? { id: request.clubId, name: clubName ?? null } : null,
            };
        }));
    } catch (error) {
        console.error('[privacy] list requests failed:', error);
        res.status(500).json({ error: 'Nu am putut încărca cererile.' });
    }
});

/**
 * POST /api/privacy/requests/:id/resolve { note } — "rezolvat": the club has
 * answered the request (deleted or anonymised the data, or explained what it
 * must keep). The requester is told in the app.
 */
router.post('/requests/:id/resolve', writeLimiter, async (req, res) => {
    try {
        const caller = await requireRequestUser(req, res);
        if (!caller) return;
        if (!canAnswer(caller.role)) return res.status(403).json({ error: 'Doar administratorii clubului rezolvă aceste cereri.' });

        const id = Number(req.params.id);
        if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'Cerere invalidă.' });
        const parsed = parseResolveInput(req.body);
        if (!parsed.ok) return res.status(400).json({ error: parsed.error });

        const [request] = await db.select().from(privacyRequests).where(eq(privacyRequests.id, id)).limit(1);
        // Another club's request reads as missing, not as forbidden.
        if (!request || (caller.role !== 'superadmin' && request.clubId !== caller.clubId)) {
            return res.status(404).json({ error: 'Cererea nu există.' });
        }

        // Only an open request closes, once: a second click (or another admin
        // at the same time) gets 409 instead of a second "resolved".
        const [closed] = await db.update(privacyRequests)
            .set({ status: 'resolved', closedAt: new Date().toISOString(), closedBy: caller.id, resolutionNote: parsed.value.note })
            .where(and(eq(privacyRequests.id, id), eq(privacyRequests.status, 'open')))
            .returning();
        if (!closed) return res.status(409).json({ error: 'Cererea a fost deja rezolvată.' });

        await db.insert(notifications).values({
            userId: request.userId,
            type: 'privacy_request_resolved',
            title: 'Cererea ta de ștergere a datelor a fost rezolvată',
            message: parsed.value.note ?? 'Clubul a răspuns cererii tale privind datele personale.',
        });
        void writeAuditLog({
            action: 'privacy.erasure_resolved', entityType: 'user', entityId: request.userId,
            actorUserId: caller.id, actorRole: caller.role, clubId: request.clubId, ipAddress: req.ip ?? null,
            metadata: { requestId: id, note: parsed.value.note },
        });

        res.json({ id: closed.id, status: closed.status, closedAt: closed.closedAt, resolutionNote: closed.resolutionNote });
    } catch (error) {
        console.error('[privacy] resolve failed:', error);
        res.status(500).json({ error: 'Nu am putut închide cererea.' });
    }
});

export default router;
