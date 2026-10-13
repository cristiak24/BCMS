import { eq, sql } from 'drizzle-orm';
import { db } from '../db';
import { userActivityMonths, users } from '../db/schema';

/**
 * Who used the app, and when — the basis of platform billing (super admin →
 * Facturare) and of "ultima activitate" everywhere.
 *
 * authenticate() calls recordActivity() on every authenticated request; it
 * writes at most once per account every THROTTLE_MS per server process, and
 * never blocks or fails the request it rides on.
 */

const TIME_ZONE = 'Europe/Bucharest';
const THROTTLE_MS = 10 * 60 * 1000;

const lastWrite = new Map<number, { at: number; day: string }>();
let warnedFailure = false;

/** Calendar day and month of `date` in Romania (invoices follow local months). */
export function activityKeys(date: Date) {
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: TIME_ZONE,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).formatToParts(date);
    const get = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
    const day = `${get('year')}-${get('month')}-${get('day')}`;
    return { day, month: day.slice(0, 7) };
}

/** True when this visit should be written (first in a while, or a new day). */
export function shouldRecord(previous: { at: number; day: string } | undefined, now: number, day: string) {
    if (!previous) return true;
    return previous.day !== day || now - previous.at >= THROTTLE_MS;
}

type ActiveUser = { id: number; clubId: number | null; role: string | null; status?: string | null };

export async function writeActivity(user: ActiveUser, at = new Date()) {
    const { day, month } = activityKeys(at);
    const iso = at.toISOString();

    await db.insert(userActivityMonths).values({
        userId: user.id,
        clubId: user.clubId ?? null,
        role: (user.role ?? null) as typeof userActivityMonths.$inferInsert['role'],
        month,
        activeDays: 1,
        lastSeenDay: day,
        firstSeenAt: iso,
        lastSeenAt: iso,
    }).onConflictDoUpdate({
        target: [userActivityMonths.userId, userActivityMonths.month],
        set: {
            clubId: user.clubId ?? null,
            role: (user.role ?? null) as typeof userActivityMonths.$inferInsert['role'],
            lastSeenAt: iso,
            activeDays: sql`${userActivityMonths.activeDays} + CASE WHEN ${userActivityMonths.lastSeenDay} = ${day} THEN 0 ELSE 1 END`,
            lastSeenDay: day,
        },
    });

    await db.update(users).set({ lastLoginAt: iso }).where(eq(users.id, user.id));
}

export function recordActivity(user: ActiveUser | null | undefined) {
    if (!user || typeof user.id !== 'number' || user.status === 'disabled') return;

    const now = Date.now();
    const { day } = activityKeys(new Date(now));
    if (!shouldRecord(lastWrite.get(user.id), now, day)) return;
    lastWrite.set(user.id, { at: now, day });

    void writeActivity(user, new Date(now)).catch((error) => {
        // Retry on the next request rather than waiting out the throttle.
        lastWrite.delete(user.id);
        if (!warnedFailure) {
            warnedFailure = true;
            console.error('Activity tracking failed (is migration 0021 applied?):', error);
        }
    });
}
