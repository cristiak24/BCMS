import { Router } from 'express';
import { and, desc, eq, inArray, or } from 'drizzle-orm';
import { db } from '../db';
import {
    accessRequests,
    attendance,
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
            const responders = await db.select({ id: users.id }).from(users).where(and(
                eq(users.status, 'active'),
                caller.clubId != null
                    ? or(and(eq(users.role, 'admin'), eq(users.clubId, caller.clubId)), eq(users.role, 'superadmin'))
                    : eq(users.role, 'superadmin'),
            ));
            const title = 'Cerere de ștergere a datelor';
            const message = `${caller.name || caller.email} (${caller.email}) a cerut ștergerea contului și a datelor personale. Răspunde în cel mult 30 de zile.`;
            if (responders.length) {
                await db.insert(notifications).values(responders.map((row) => ({ userId: row.id, type: 'privacy_request', title, message })));
                void sendNotificationEmails(responders.map((row) => ({ userId: row.id, subject: title, title, body: message, path: '/admin/users' })));
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

export default router;
