import webpush from 'web-push';
import { and, eq, inArray, ne, sql } from 'drizzle-orm';
import { db } from '../db';
import { pushPreferences, pushSubscriptions, users } from '../db/schema';

/**
 * Web push (Val 3B). The in-app notification stays the source of truth: a push
 * only says that something happened („Program modificat”) and links to the
 * screen; the details load after the app opens, behind the login. No names,
 * amounts or times leave the server in a push.
 *
 * Without VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY / VAPID_SUBJECT push is off:
 * nothing is sent and GET /api/push/config answers { enabled: false }.
 */

export type PushKind = 'event_new' | 'event_changed' | 'rsvp_reminder' | 'rsvp_declined' | 'payment_overdue';

export const PUSH_KINDS: PushKind[] = ['event_new', 'event_changed', 'rsvp_reminder', 'rsvp_declined', 'payment_overdue'];

/** The in-app notification types that may also go out as push. */
const KIND_BY_TYPE: Record<string, PushKind> = {
    event_created: 'event_new',
    event_changed: 'event_changed',
    event_cancelled: 'event_changed',
    rsvp_reminder: 'rsvp_reminder',
    rsvp_declined: 'rsvp_declined',
    payment_reminder: 'payment_overdue',
};

const FAMILY_KINDS: PushKind[] = ['event_new', 'event_changed', 'rsvp_reminder', 'payment_overdue'];
const STAFF_KINDS: PushKind[] = ['rsvp_declined'];

/** What a role can receive — and so which switches its profile shows. */
export function pushKindsForRole(role: string | null | undefined): PushKind[] {
    if (role === 'player' || role === 'parent') return FAMILY_KINDS;
    if (role === 'coach' || role === 'admin') return STAFF_KINDS;
    return [];
}

export const PUSH_BODY = 'Deschide aplicația pentru detalii.';
const MAX_FAILURES = 5;
const TTL_SECONDS = 2 * 24 * 60 * 60;
const CONCURRENCY = 5;

type VapidConfig = { publicKey: string; privateKey: string; subject: string };
let config: VapidConfig | null | undefined;

function readConfig(): VapidConfig | null {
    const publicKey = process.env.VAPID_PUBLIC_KEY?.trim();
    const privateKey = process.env.VAPID_PRIVATE_KEY?.trim();
    const subject = process.env.VAPID_SUBJECT?.trim();
    if (!publicKey || !privateKey || !subject) return null;
    try {
        // Validates the keys and the subject (mailto: or https:).
        webpush.setVapidDetails(subject, publicKey, privateKey);
        return { publicKey, privateKey, subject };
    } catch (error) {
        console.error('[push] VAPID keys rejected; push stays off:', (error as Error).message);
        return null;
    }
}

function vapid() {
    if (config === undefined) {
        config = readConfig();
        if (!config) console.warn('[push] VAPID_* not set; web push is off.');
    }
    return config;
}

export function pushEnabled() {
    return vapid() != null;
}

export function pushPublicKey() {
    return vapid()?.publicKey ?? null;
}

export type PushTarget = { endpoint: string; p256dh: string; auth: string };
export type PushPayload = { title: string; body: string; url: string; tag: string };
type SendOptions = { TTL: number; topic?: string; urgency?: 'normal' | 'high' };
type Sender = (target: PushTarget, payload: string, options: SendOptions) => Promise<unknown>;

const defaultSender: Sender = (target, payload, options) => webpush.sendNotification(
    { endpoint: target.endpoint, keys: { p256dh: target.p256dh, auth: target.auth } },
    payload,
    options,
);
let sender: Sender = defaultSender;

/** Tests only: replace the push service and re-read the VAPID variables. */
export function setPushSenderForTests(next: Sender | null) {
    sender = next ?? defaultSender;
    config = undefined;
}

/** One push for one account, built from an in-app notification. */
export type PushItem = {
    userId: number;
    notificationId?: number | null;
    type: string;
    title: string;
    eventId?: number | null;
    /** The child the notification is about (a parent's link selects it). */
    childId?: number | null;
};

type Recipient = { id: number; role: string };

/** Where a tap on the notification lands, for this account. */
export function pushPath(item: PushItem, role: string) {
    const params = new URLSearchParams();
    let path = '/notifications';
    if (item.type === 'rsvp_declined' && item.eventId != null) {
        path = role === 'coach' ? '/coach/attendance' : `/admin/attendance/${item.eventId}`;
        if (role === 'coach') params.set('event', String(item.eventId));
    } else if (item.type === 'payment_reminder') {
        path = '/payments';
    } else if (item.eventId != null) {
        path = '/schedule';
        params.set('event', String(item.eventId));
    }
    if (role === 'parent' && item.childId != null) params.set('child', String(item.childId));
    if (item.notificationId != null) params.set('n', String(item.notificationId));
    const query = params.toString();
    return query ? `${path}?${query}` : path;
}

/** Collapses a newer push over an older one about the same thing. */
function pushTag(item: PushItem) {
    if (item.type === 'payment_reminder') return 'pay';
    if (item.type === 'rsvp_reminder') return `rsvp${item.eventId ?? ''}`;
    if (item.type === 'rsvp_declined') return `abs${item.eventId ?? ''}c${item.childId ?? ''}`;
    if (item.eventId != null) return `ev${item.eventId}`;
    return item.type.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 32);
}

export function buildPayload(item: PushItem, role: string): PushPayload {
    return { title: item.title, body: PUSH_BODY, url: pushPath(item, role), tag: pushTag(item) };
}

const PREF_COLUMN: Record<PushKind, keyof typeof pushPreferences.$inferSelect> = {
    event_new: 'eventNew',
    event_changed: 'eventChanged',
    rsvp_reminder: 'rsvpReminder',
    rsvp_declined: 'rsvpDeclined',
    payment_overdue: 'paymentOverdue',
};

export function preferenceAllows(row: typeof pushPreferences.$inferSelect | undefined, kind: PushKind) {
    return row ? row[PREF_COLUMN[kind]] !== false : true;
}

/** What the service answered, as far as keeping the subscription goes. */
function statusOf(error: unknown) {
    const code = (error as { statusCode?: unknown })?.statusCode;
    return typeof code === 'number' ? code : null;
}

async function recordFailure(id: number, error: unknown) {
    const status = statusOf(error);
    if (status === 404 || status === 410) {
        // The browser unsubscribed or the subscription expired: gone for good.
        await db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, id));
        return 'gone' as const;
    }
    const [row] = await db.update(pushSubscriptions)
        .set({ failureCount: sql`${pushSubscriptions.failureCount} + 1` })
        .where(eq(pushSubscriptions.id, id))
        .returning({ failureCount: pushSubscriptions.failureCount });
    if (row && row.failureCount >= MAX_FAILURES) {
        await db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, id));
        return 'gone' as const;
    }
    console.warn('[push] send failed', status ?? (error as Error)?.message);
    return 'failed' as const;
}

async function recordSuccess(id: number) {
    await db.update(pushSubscriptions)
        .set({ failureCount: 0, lastSuccessAt: new Date().toISOString() })
        .where(eq(pushSubscriptions.id, id));
}

type Job = { subscriptionId: number; target: PushTarget; payload: PushPayload; urgency: 'normal' | 'high' };

/** Sends one push; true when the push service accepted it. */
async function deliver(job: Job) {
    try {
        await sender(job.target, JSON.stringify(job.payload), { TTL: TTL_SECONDS, topic: job.payload.tag, urgency: job.urgency });
        await recordSuccess(job.subscriptionId);
        return true;
    } catch (error) {
        await recordFailure(job.subscriptionId, error);
        return false;
    }
}

async function runPool(jobs: Job[]) {
    let next = 0;
    let sent = 0;
    const worker = async () => {
        while (next < jobs.length) {
            const job = jobs[next++];
            if (await deliver(job)) sent += 1;
        }
    };
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, jobs.length) }, worker));
    return sent;
}

/**
 * The push copies of freshly saved in-app notifications. Respects each
 * account's preferences and role; disabled accounts get nothing. Never throws.
 */
export async function sendPushForNotifications(items: PushItem[]) {
    if (!items.length || !pushEnabled()) return 0;
    try {
        const relevant = items.filter((item) => KIND_BY_TYPE[item.type]);
        if (!relevant.length) return 0;
        const userIds = Array.from(new Set(relevant.map((item) => item.userId)));
        const [recipients, subscriptions, preferences] = await Promise.all([
            db.select({ id: users.id, role: users.role }).from(users)
                .where(and(inArray(users.id, userIds), ne(users.status, 'disabled'))),
            db.select().from(pushSubscriptions).where(inArray(pushSubscriptions.userId, userIds)),
            db.select().from(pushPreferences).where(inArray(pushPreferences.userId, userIds)),
        ]);
        const roleOf = new Map<number, Recipient>(recipients.map((row) => [row.id, { id: row.id, role: String(row.role) }]));
        const prefsOf = new Map(preferences.map((row) => [row.userId, row]));
        const devicesOf = new Map<number, typeof subscriptions>();
        subscriptions.forEach((row) => devicesOf.set(row.userId, [...(devicesOf.get(row.userId) ?? []), row]));

        const jobs: Job[] = [];
        const seen = new Set<string>();
        for (const item of relevant) {
            const kind = KIND_BY_TYPE[item.type];
            const recipient = roleOf.get(item.userId);
            if (!recipient || !pushKindsForRole(recipient.role).includes(kind)) continue;
            if (!preferenceAllows(prefsOf.get(item.userId), kind)) continue;
            const payload = buildPayload(item, recipient.role);
            for (const device of devicesOf.get(item.userId) ?? []) {
                // Two notifications with the same tag on one device: the newer is enough.
                const key = `${device.id}:${payload.tag}`;
                if (seen.has(key)) continue;
                seen.add(key);
                jobs.push({
                    subscriptionId: device.id,
                    target: { endpoint: device.endpoint, p256dh: device.p256dh, auth: device.auth },
                    payload,
                    urgency: item.type === 'event_cancelled' || item.type === 'event_changed' ? 'high' : 'normal',
                });
            }
        }
        return await runPool(jobs);
    } catch (error) {
        console.error('[push] dispatch failed:', error);
        return 0;
    }
}

const inflight = new Set<Promise<unknown>>();

/**
 * Fire and forget: the admin's action has already succeeded, a slow or failing
 * push service must not hold up or fail the request.
 */
export function queuePush(items: PushItem[]) {
    if (!items.length || !pushEnabled()) return;
    const job = sendPushForNotifications(items).finally(() => inflight.delete(job));
    inflight.add(job);
}

/** Tests: wait for every queued push. */
export async function flushPush() {
    while (inflight.size) await Promise.all(Array.from(inflight));
}

/** POST /api/push/test: one push to one of the caller's devices, awaited. */
export async function sendTestPush(subscription: typeof pushSubscriptions.$inferSelect) {
    return deliver({
        subscriptionId: subscription.id,
        target: { endpoint: subscription.endpoint, p256dh: subscription.p256dh, auth: subscription.auth },
        payload: { title: 'Notificările funcționează', body: 'Așa vei afla de schimbările din program.', url: '/profile', tag: 'test' },
        urgency: 'normal',
    });
}
