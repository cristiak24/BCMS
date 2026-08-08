import { db } from '../db';
import { notifications, players, users } from '../db/schema';
import { eq, sql } from 'drizzle-orm';

const NOTE_PREVIEW_MAX_LENGTH = 300;

function truncateNote(note: string) {
    if (note.length <= NOTE_PREVIEW_MAX_LENGTH) {
        return note;
    }
    return `${note.slice(0, NOTE_PREVIEW_MAX_LENGTH)}…`;
}

/**
 * Notifies the player linked to `playerId` (matched by email, same convention
 * used across profile.ts/requestContext.ts) that a coach/admin left them
 * feedback. Players without a linked user account (no login) are silently
 * skipped — there is nowhere to deliver the notification.
 */
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
    const playerRows = await db.select().from(players).where(eq(players.id, playerId)).limit(1);
    const player = playerRows[0];
    if (!player?.email) {
        return;
    }

    const userRows = await db
        .select()
        .from(users)
        .where(sql`lower(${users.email}) = lower(${player.email})`)
        .limit(1);
    const recipient = userRows[0];
    if (!recipient) {
        return;
    }

    await db.insert(notifications).values({
        userId: recipient.id,
        type: 'player_feedback',
        title: 'Feedback nou',
        message: `Ai primit feedback la "${eventTitle}": ${truncateNote(note)}`,
        eventId,
        playerId,
    });
}
