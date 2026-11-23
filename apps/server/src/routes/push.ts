import { Router, type Response } from 'express';
import { and, asc, eq, notInArray } from 'drizzle-orm';
import { db } from '../db';
import { pushPreferences, pushSubscriptions } from '../db/schema';
import { authenticate, type AuthenticatedRequest } from '../middleware/auth';
import { rateLimit } from '../middleware/rateLimit';
import { toIso } from '../lib/dateUtils';
import { PUSH_KINDS, preferenceAllows, pushEnabled, pushKindsForRole, pushPublicKey, sendTestPush, type PushKind } from '../lib/push';

/**
 * Web push (Val 3B): this account's devices and its per-type choices.
 * Profil → „Notificări pe dispozitiv”. Everything is scoped to the caller.
 */
const router = Router();
router.use(authenticate);

const MAX_DEVICES = 10;
const MAX_ENDPOINT = 2048;
const KEY_PATTERN = /^[A-Za-z0-9_-]{8,255}={0,2}$/;

const PREF_FIELDS: Record<PushKind, 'eventNew' | 'eventChanged' | 'rsvpReminder' | 'rsvpDeclined' | 'paymentOverdue'> = {
    event_new: 'eventNew',
    event_changed: 'eventChanged',
    rsvp_reminder: 'rsvpReminder',
    rsvp_declined: 'rsvpDeclined',
    payment_overdue: 'paymentOverdue',
};

function requireUser(req: AuthenticatedRequest, res: Response) {
    if (!req.user) {
        res.status(403).json({ error: 'Contul tău nu are încă un profil în club.' });
        return null;
    }
    return req.user;
}

/** Push service URLs are https; anything else is not a browser subscription. */
function validEndpoint(value: unknown): value is string {
    if (typeof value !== 'string' || !value || value.length > MAX_ENDPOINT) return false;
    try {
        return new URL(value).protocol === 'https:';
    } catch {
        return false;
    }
}

/** „iPhone · aplicația”: letters, digits, spaces and a few separators, max 60. */
function cleanLabel(value: unknown) {
    if (typeof value !== 'string') return null;
    const label = value.replace(/[^\p{L}\p{N} ·.,()/-]/gu, '').replace(/\s+/g, ' ').trim().slice(0, 60);
    return label || null;
}

async function preferencesOf(userId: number, role: string) {
    const [row] = await db.select().from(pushPreferences).where(eq(pushPreferences.userId, userId)).limit(1);
    const kinds = pushKindsForRole(role);
    return Object.fromEntries(kinds.map((kind) => [kind, preferenceAllows(row, kind)])) as Partial<Record<PushKind, boolean>>;
}

router.get('/config', (_req, res) => {
    res.json({ enabled: pushEnabled(), publicKey: pushPublicKey() });
});

/** Devices + preferences. `kinds` empty → the profile hides the card. */
router.get('/me', async (req: AuthenticatedRequest, res) => {
    const user = requireUser(req, res);
    if (!user) return;
    try {
        const kinds = pushKindsForRole(user.role);
        const devices = await db.select({ id: pushSubscriptions.id, label: pushSubscriptions.deviceLabel, endpoint: pushSubscriptions.endpoint, createdAt: pushSubscriptions.createdAt })
            .from(pushSubscriptions).where(eq(pushSubscriptions.userId, user.id)).orderBy(asc(pushSubscriptions.createdAt));
        res.json({
            enabled: pushEnabled(),
            kinds,
            preferences: await preferencesOf(user.id, user.role),
            // The endpoint lets the client tell which row is this browser.
            devices: devices.map((row) => ({ id: row.id, label: row.label, endpoint: row.endpoint, createdAt: toIso(row.createdAt) })),
        });
    } catch (error) {
        console.error('[push] me failed:', error);
        res.status(500).json({ error: 'Nu am putut încărca notificările.' });
    }
});

/** Subscribe this browser (or move it to this account: a shared phone). */
router.put('/subscription', rateLimit({ bucket: 'push:subscribe', limit: 20, windowMs: 10 * 60 * 1000 }), async (req: AuthenticatedRequest, res) => {
    const user = requireUser(req, res);
    if (!user) return;
    if (!pushEnabled()) return res.status(503).json({ error: 'Notificările pe dispozitiv nu sunt disponibile.', code: 'PUSH_DISABLED' });
    if (!pushKindsForRole(user.role).length) return res.status(403).json({ error: 'Contul tău nu primește notificări pe dispozitiv.' });
    const { endpoint, keys, label } = (req.body ?? {}) as { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown }; label?: unknown };
    const p256dh = keys?.p256dh;
    const auth = keys?.auth;
    if (!validEndpoint(endpoint) || typeof p256dh !== 'string' || typeof auth !== 'string' || !KEY_PATTERN.test(p256dh) || !KEY_PATTERN.test(auth)) {
        return res.status(400).json({ error: 'Abonament invalid.' });
    }
    try {
        const [row] = await db.insert(pushSubscriptions)
            .values({ userId: user.id, endpoint, p256dh, auth, deviceLabel: cleanLabel(label) })
            .onConflictDoUpdate({
                target: pushSubscriptions.endpoint,
                set: { userId: user.id, p256dh, auth, deviceLabel: cleanLabel(label), failureCount: 0 },
            })
            .returning({ id: pushSubscriptions.id });
        // At most ten devices: the oldest go.
        const keep = await db.select({ id: pushSubscriptions.id }).from(pushSubscriptions)
            .where(eq(pushSubscriptions.userId, user.id))
            .orderBy(asc(pushSubscriptions.createdAt), asc(pushSubscriptions.id));
        if (keep.length > MAX_DEVICES) {
            const survivors = keep.slice(-MAX_DEVICES).map((r) => r.id);
            await db.delete(pushSubscriptions).where(and(eq(pushSubscriptions.userId, user.id), notInArray(pushSubscriptions.id, survivors)));
        }
        res.json({ id: row.id });
    } catch (error) {
        console.error('[push] subscribe failed:', error);
        res.status(500).json({ error: 'Nu am putut activa notificările.' });
    }
});

/** Turn this browser off (also called on sign-out). */
router.post('/unsubscribe', async (req: AuthenticatedRequest, res) => {
    const user = requireUser(req, res);
    if (!user) return;
    const { endpoint } = (req.body ?? {}) as { endpoint?: unknown };
    if (!validEndpoint(endpoint)) return res.status(400).json({ error: 'Abonament invalid.' });
    try {
        await db.delete(pushSubscriptions).where(and(eq(pushSubscriptions.userId, user.id), eq(pushSubscriptions.endpoint, endpoint)));
        res.json({ ok: true });
    } catch (error) {
        console.error('[push] unsubscribe failed:', error);
        res.status(500).json({ error: 'Nu am putut opri notificările.' });
    }
});

/** Remove another of my devices. */
router.delete('/devices/:id', async (req: AuthenticatedRequest, res) => {
    const user = requireUser(req, res);
    if (!user) return;
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'Dispozitiv invalid.' });
    try {
        const removed = await db.delete(pushSubscriptions)
            .where(and(eq(pushSubscriptions.id, id), eq(pushSubscriptions.userId, user.id)))
            .returning({ id: pushSubscriptions.id });
        if (!removed.length) return res.status(404).json({ error: 'Dispozitivul nu mai există.' });
        res.json({ ok: true });
    } catch (error) {
        console.error('[push] remove device failed:', error);
        res.status(500).json({ error: 'Nu am putut elimina dispozitivul.' });
    }
});

/** { event_new: false, ... } — only the kinds this role receives. */
router.put('/preferences', async (req: AuthenticatedRequest, res) => {
    const user = requireUser(req, res);
    if (!user) return;
    const body = (req.body ?? {}) as Record<string, unknown>;
    const allowed = pushKindsForRole(user.role);
    const set: Partial<Record<(typeof PREF_FIELDS)[PushKind], boolean>> = {};
    for (const kind of PUSH_KINDS) {
        if (!(kind in body)) continue;
        if (!allowed.includes(kind) || typeof body[kind] !== 'boolean') {
            return res.status(400).json({ error: 'Preferință invalidă.' });
        }
        set[PREF_FIELDS[kind]] = body[kind] as boolean;
    }
    try {
        const updatedAt = new Date().toISOString();
        await db.insert(pushPreferences)
            .values({ userId: user.id, ...set, updatedAt })
            .onConflictDoUpdate({ target: pushPreferences.userId, set: { ...set, updatedAt } });
        res.json({ preferences: await preferencesOf(user.id, user.role) });
    } catch (error) {
        console.error('[push] preferences failed:', error);
        res.status(500).json({ error: 'Nu am putut salva preferințele.' });
    }
});

/** A test push to this browser. */
router.post('/test', rateLimit({ bucket: 'push:test', limit: 3, windowMs: 10 * 60 * 1000 }), async (req: AuthenticatedRequest, res) => {
    const user = requireUser(req, res);
    if (!user) return;
    if (!pushEnabled()) return res.status(503).json({ error: 'Notificările pe dispozitiv nu sunt disponibile.', code: 'PUSH_DISABLED' });
    const { endpoint } = (req.body ?? {}) as { endpoint?: unknown };
    if (!validEndpoint(endpoint)) return res.status(400).json({ error: 'Abonament invalid.' });
    try {
        const [device] = await db.select().from(pushSubscriptions)
            .where(and(eq(pushSubscriptions.userId, user.id), eq(pushSubscriptions.endpoint, endpoint))).limit(1);
        if (!device) return res.status(404).json({ error: 'Notificările nu sunt active pe acest dispozitiv.', code: 'PUSH_NOT_SUBSCRIBED' });
        const sent = await sendTestPush(device);
        if (!sent) return res.status(502).json({ error: 'Notificarea de probă nu a putut fi trimisă. Încearcă să le oprești și să le activezi din nou.' });
        res.json({ ok: true });
    } catch (error) {
        console.error('[push] test failed:', error);
        res.status(500).json({ error: 'Notificarea de probă nu a putut fi trimisă.' });
    }
});

export default router;
