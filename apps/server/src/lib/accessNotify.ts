import { and, eq } from 'drizzle-orm';
import { db } from '../db';
import { accessRequests, familyJoinRequests, notifications, teams, users } from '../db/schema';
import { sendNotificationEmails } from './mailer';
import { decisionNotice, reviewerNotice, roleLabel, summarizeOwnRequests, type OwnRequest } from './accessNotices';

/**
 * Tell people about access requests: the club's reviewers when one arrives,
 * the requester when it is decided. Best effort — a failure here must never
 * undo a signup or an approval, so nothing in this file throws.
 */

const ADMIN_PATH = '/admin/manage-access';
const COACH_PATH = '/coach/requests';

async function reviewersOf(clubId: number, teamId: number | null) {
    const recipients = new Map<number, string>();
    const admins = await db.select({ id: users.id }).from(users)
        .where(and(eq(users.clubId, clubId), eq(users.role, 'admin'), eq(users.status, 'active')));
    admins.forEach((admin) => recipients.set(admin.id, ADMIN_PATH));

    if (teamId != null) {
        const [team] = await db.select({ coachId: teams.coachId }).from(teams).where(eq(teams.id, teamId)).limit(1);
        if (team?.coachId != null && !recipients.has(team.coachId)) {
            const [coach] = await db.select({ id: users.id }).from(users)
                .where(and(eq(users.id, team.coachId), eq(users.status, 'active')))
                .limit(1);
            if (coach) recipients.set(coach.id, COACH_PATH);
        }
    }
    return recipients;
}

async function deliver(recipients: Map<number, string>, content: { type: string; title: string; message: string }, options: { email: boolean }) {
    if (!recipients.size) return;
    await db.insert(notifications).values(Array.from(recipients.keys()).map((userId) => ({ userId, ...content })));
    if (options.email) {
        await sendNotificationEmails(Array.from(recipients, ([userId, path]) => ({
            userId,
            subject: content.title,
            title: content.title,
            body: content.message,
            path,
        })));
    }
}

export async function notifyReviewers(params: {
    clubId: number | null;
    teamId?: number | null;
    requesterId: number;
    requesterName: string;
    role: string;
    children?: string[];
    teamName?: string | null;
}) {
    try {
        if (params.clubId == null) return;
        const recipients = await reviewersOf(params.clubId, params.teamId ?? null);
        recipients.delete(params.requesterId);
        await deliver(recipients, reviewerNotice(params), { email: true });
    } catch (error) {
        console.error('[accessNotify] reviewers not notified:', error);
    }
}

/** `email: false` keeps an extra child on an already-active account in the app only. */
export async function notifyRequester(params: {
    userId: number;
    decision: 'approved' | 'denied';
    subject?: string | null;
    email?: boolean;
}) {
    try {
        await deliver(
            new Map([[params.userId, '/']]),
            decisionNotice({ decision: params.decision, subject: params.subject }),
            { email: params.email ?? true },
        );
    } catch (error) {
        console.error('[accessNotify] requester not notified:', error);
    }
}

export async function loadOwnRequests(userId: number) {
    const [joins, access] = await Promise.all([
        db.select({ request: familyJoinRequests, teamName: teams.name }).from(familyJoinRequests)
            .innerJoin(teams, eq(teams.id, familyJoinRequests.teamId))
            .where(eq(familyJoinRequests.userId, userId)),
        db.select().from(accessRequests).where(eq(accessRequests.userId, userId)),
    ]);
    const requests: OwnRequest[] = [
        ...joins.map(({ request, teamName }) => ({
            id: `join-${request.id}`,
            label: `${request.childFirstName} ${request.childLastName}`.trim(),
            detail: teamName,
            status: request.status as OwnRequest['status'],
            createdAt: request.createdAt,
        })),
        ...access.map((request) => ({
            id: `access-${request.id}`,
            label: `Acces ca ${roleLabel(request.requestedRole)}`,
            detail: null,
            status: request.status as OwnRequest['status'],
            createdAt: request.createdAt,
        })),
    ];
    return summarizeOwnRequests(requests);
}
