import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import { db } from '../db';
import { players, users } from '../db/schema';
import { splitDisplayName } from './password';

/**
 * An approved player account only got a players row when its link carried a
 * team, so the rest were on Conturi but nowhere in Lot. Gives every active
 * player account of the club exactly one row: claims an unclaimed row with the
 * same email first (as lib/selfPlayer.ts does), otherwise creates it
 * unassigned. Safe to repeat — players.user_id is unique.
 */
export async function ensureClubPlayerRecords(clubId: number) {
    const accounts = await db.select({
        id: users.id,
        name: users.name,
        firstName: users.firstName,
        lastName: users.lastName,
        email: users.email,
        phone: users.phone,
    }).from(users).where(and(eq(users.clubId, clubId), eq(users.role, 'player'), eq(users.status, 'active')));
    if (!accounts.length) return;

    const linked = new Set(
        (await db.select({ userId: players.userId }).from(players).where(inArray(players.userId, accounts.map((a) => a.id))))
            .map((row) => row.userId)
    );
    const missing = accounts.filter((account) => !linked.has(account.id));
    if (!missing.length) return;

    for (const account of missing) {
        const email = account.email.trim().toLowerCase();
        const [unclaimed] = await db.select({ id: players.id }).from(players)
            .where(and(sql`lower(trim(${players.email})) = ${email}`, isNull(players.userId)))
            .limit(1);
        if (unclaimed) {
            await db.update(players).set({ userId: account.id }).where(and(eq(players.id, unclaimed.id), isNull(players.userId)));
            continue;
        }

        const split = splitDisplayName(account.name);
        const firstName = account.firstName || split.firstName;
        const lastName = account.lastName || split.lastName;
        await db.insert(players).values({
            name: account.name,
            firstName,
            lastName,
            status: 'active',
            email: account.email,
            phone: account.phone,
            userId: account.id,
        }).onConflictDoNothing();
    }
}
