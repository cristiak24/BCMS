import { Resend } from 'resend';
import { and, eq, inArray, ne } from 'drizzle-orm';
import { db } from '../db';
import { users } from '../db/schema';
import { loadServerEnv } from './loadEnv';
import { resolvePublicAppUrl } from './publicUrl';
import { renderNotificationEmail } from './notificationEmail';

loadServerEnv();

/**
 * Notification emails (payment reminders, cancelled or moved sessions), sent
 * next to the in-app notification. Only to active accounts that kept
 * Profil → Notificări → Email on. Without RESEND_API_KEY nothing is sent —
 * the in-app notification still is. Never throws: a mail outage must not
 * fail the action that triggered it.
 */

const RESEND_API_KEY = process.env.RESEND_API_KEY?.trim() || '';
const FROM = process.env.RESEND_FROM_EMAIL?.trim() || 'BCMS <no-reply@bcms.ro>';
const resend = RESEND_API_KEY ? new Resend(RESEND_API_KEY) : null;
const BATCH = 100;

export type NotificationEmail = {
    userId: number;
    subject: string;
    title: string;
    body: string;
    /** Path in the app the button opens, e.g. "/payments". */
    path: string;
};

export async function sendNotificationEmails(emails: NotificationEmail[]) {
    if (!emails.length) return 0;
    if (!resend) {
        console.warn('[mailer] RESEND_API_KEY missing; notification emails skipped.');
        return 0;
    }
    try {
        const ids = Array.from(new Set(emails.map((email) => email.userId)));
        const recipients = await db
            .select({ id: users.id, email: users.email })
            .from(users)
            .where(and(inArray(users.id, ids), eq(users.emailNotifications, true), ne(users.status, 'disabled')));
        const addressById = new Map(recipients.map((row) => [row.id, row.email]));
        const appUrl = resolvePublicAppUrl();
        const messages = emails
            .filter((email) => addressById.has(email.userId))
            .map((email) => ({ from: FROM, to: addressById.get(email.userId)!, subject: email.subject, ...renderNotificationEmail(email, appUrl) }));

        let sent = 0;
        for (let index = 0; index < messages.length; index += BATCH) {
            const chunk = messages.slice(index, index + BATCH);
            const result = await resend.batch.send(chunk);
            if (result.error) {
                console.error('[mailer] batch failed:', result.error);
            } else {
                sent += chunk.length;
            }
        }
        return sent;
    } catch (error) {
        console.error('[mailer] notification emails failed:', error);
        return 0;
    }
}
