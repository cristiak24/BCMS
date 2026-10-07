import { db } from '../db';
import { notifications, playerGuardians, players, playersToTeams, users } from '../db/schema';
import { and, eq, gte, inArray, ne, sql } from 'drizzle-orm';

const NOTE_PREVIEW_MAX_LENGTH = 300;

function truncateNote(note: string) {
    if (note.length <= NOTE_PREVIEW_MAX_LENGTH) {
        return note;
    }
    return `${note.slice(0, NOTE_PREVIEW_MAX_LENGTH)}…`;
}

/**
 * Accounts that should hear about a player: the player's own sign-in (matched
 * by email, as everywhere else) and every linked parent. Parents used to be
 * left out entirely, so a child without an account meant nobody was told.
 */
export async function recipientsForPlayers(playerIds: number[]) {
    const byPlayer = new Map<number, Set<number>>();
    if (!playerIds.length) return byPlayer;
    playerIds.forEach((id) => byPlayer.set(id, new Set()));

    const [playerRows, guardianRows] = await Promise.all([
        db.select({ id: players.id, email: players.email }).from(players).where(inArray(players.id, playerIds)),
        db.select({ playerId: playerGuardians.playerId, userId: playerGuardians.userId }).from(playerGuardians).where(inArray(playerGuardians.playerId, playerIds)),
    ]);
    const emails = playerRows.map((row) => row.email?.trim().toLowerCase()).filter((email): email is string => Boolean(email));
    const accounts = emails.length
        ? await db.select({ id: users.id, email: users.email }).from(users)
            .where(and(inArray(sql<string>`lower(${users.email})`, emails), ne(users.status, 'disabled')))
        : [];
    const accountByEmail = new Map(accounts.map((account) => [account.email.trim().toLowerCase(), account.id]));

    playerRows.forEach((row) => {
        const accountId = row.email ? accountByEmail.get(row.email.trim().toLowerCase()) : undefined;
        if (accountId != null) byPlayer.get(row.id)?.add(accountId);
    });
    guardianRows.forEach((row) => byPlayer.get(row.playerId)?.add(row.userId));
    return byPlayer;
}

type NewNotification = {
    type: string;
    title: string;
    message: string;
    eventId?: number | null;
    playerId?: number | null;
};

async function notifyPlayers(playerIds: number[], build: (playerId: number) => NewNotification) {
    const recipients = await recipientsForPlayers(playerIds);
    const rows: Array<typeof notifications.$inferInsert> = [];
    const seen = new Set<string>();
    for (const [playerId, userIds] of recipients) {
        const content = build(playerId);
        for (const userId of userIds) {
            // A parent of two children on the same team hears about one event once.
            const key = `${userId}:${content.eventId ?? ''}:${content.type}:${content.eventId ? '' : playerId}`;
            if (seen.has(key)) continue;
            seen.add(key);
            rows.push({ userId, ...content });
        }
    }
    if (rows.length) await db.insert(notifications).values(rows);
    return rows.length;
}

/** Coach feedback on a session — to the player and their parents. */
export async function createFeedbackNotification({
    playerId,
    eventId,
    eventTitle,
    note,
}: {
    playerId: number;
    eventId: number;
    eventTitle: string;
    note: string;
}) {
    await notifyPlayers([playerId], () => ({
        type: 'player_feedback',
        title: 'Feedback nou',
        message: `Feedback la „${eventTitle}”: ${truncateNote(note)}`,
        eventId,
        playerId,
    }));
}

async function teamPlayerIds(teamId: number) {
    const [direct, members] = await Promise.all([
        db.select({ id: players.id, status: players.status }).from(players).where(eq(players.teamId, teamId)),
        db.select({ id: players.id, status: players.status }).from(playersToTeams).innerJoin(players, eq(players.id, playersToTeams.playerId)).where(eq(playersToTeams.teamId, teamId)),
    ]);
    return Array.from(new Set([...direct, ...members].filter((row) => (row.status ?? 'active') !== 'inactive').map((row) => row.id)));
}

function formatWhen(value: string) {
    const date = new Date(value);
    return Number.isNaN(date.getTime())
        ? value
        : new Intl.DateTimeFormat('ro-RO', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Bucharest' }).format(date);
}

/**
 * Tell a team's families that an upcoming session was cancelled or moved.
 * Past events are left alone — nobody needs to hear about last week.
 */
export async function notifyEventChange(params: {
    kind: 'cancelled' | 'rescheduled';
    teamId: number | null;
    eventId: number | null;
    title: string;
    startTime: string;
    location?: string | null;
}) {
    if (params.teamId == null || new Date(params.startTime).getTime() < Date.now()) return 0;
    const playerIds = await teamPlayerIds(params.teamId);
    const when = formatWhen(params.startTime);
    return notifyPlayers(playerIds, () => params.kind === 'cancelled'
        ? { type: 'event_cancelled', title: 'Eveniment anulat', message: `„${params.title}” din ${when} a fost anulat.`, eventId: params.eventId }
        : {
            type: 'event_changed',
            title: 'Program modificat',
            message: `„${params.title}” are loc acum ${when}${params.location ? `, la ${params.location}` : ''}.`,
            eventId: params.eventId,
        });
}

/** A payment the club recorded (desk or online) — a receipt in the app. */
export async function notifyPaymentRecorded(playerId: number, amount: number, label: string) {
    return notifyPlayers([playerId], () => ({
        type: 'payment_recorded',
        title: 'Plată înregistrată',
        message: `Am înregistrat plata de ${Math.round(amount * 100) / 100} RON${label ? ` (${label})` : ''}. Mulțumim!`,
        playerId,
    }));
}

const REMINDER_COOLDOWN_DAYS = 7;

/**
 * Payment reminders for the given players (and their parents). A family that
 * got one in the last week is skipped, so pressing the button twice doesn't
 * spam anyone. Returns how many accounts were actually notified.
 */
export async function sendPaymentReminders(owing: Array<{ playerId: number; playerName: string; outstanding: number; overdue: number }>) {
    if (!owing.length) return { notified: 0, skipped: 0 };
    const recipients = await recipientsForPlayers(owing.map((row) => row.playerId));
    const allUserIds = Array.from(new Set(Array.from(recipients.values()).flatMap((set) => Array.from(set))));
    const since = new Date(Date.now() - REMINDER_COOLDOWN_DAYS * 24 * 60 * 60 * 1000).toISOString();
    const recent = allUserIds.length
        ? await db.select({ userId: notifications.userId, playerId: notifications.playerId }).from(notifications)
            .where(and(inArray(notifications.userId, allUserIds), eq(notifications.type, 'payment_reminder'), gte(notifications.createdAt, since)))
        : [];
    const recentKeys = new Set(recent.map((row) => `${row.userId}:${row.playerId}`));

    const rows: Array<typeof notifications.$inferInsert> = [];
    let skipped = 0;
    for (const row of owing) {
        for (const userId of recipients.get(row.playerId) ?? []) {
            if (recentKeys.has(`${userId}:${row.playerId}`)) {
                skipped += 1;
                continue;
            }
            const amount = Math.round(row.outstanding * 100) / 100;
            rows.push({
                userId,
                type: 'payment_reminder',
                title: row.overdue > 0 ? 'Plată restantă' : 'Plată de efectuat',
                message: `${row.playerName}: ${amount} RON de plată${row.overdue > 0 ? `, din care ${Math.round(row.overdue * 100) / 100} RON restanți` : ''}. Poți plăti din secțiunea Plăți.`,
                playerId: row.playerId,
            });
        }
    }
    if (rows.length) await db.insert(notifications).values(rows);
    return { notified: rows.length, skipped };
}
