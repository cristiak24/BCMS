import crypto from 'crypto';
import { and, eq, gt, isNull, sql } from 'drizzle-orm';
import { db } from '../db';
import { clubs, guardianInvites, players, playerGuardians } from '../db/schema';

/**
 * Personal parent invites ("Invită părinte" on a player). Token: "fam_" + 32
 * hex chars — distinct from team codes (6), club codes (8) and link tokens
 * (64 hex). Single use, 7 days, only the hash is stored.
 */

export const GUARDIAN_INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export function looksLikeGuardianInvite(raw: string) {
    return /^fam_[a-f0-9]{32}$/.test(String(raw ?? '').trim());
}

export function hashGuardianToken(token: string) {
    return crypto.createHash('sha256').update(String(token).trim()).digest('hex');
}

export function newGuardianToken() {
    return `fam_${crypto.randomBytes(16).toString('hex')}`;
}

export async function createGuardianInvite(params: { clubId: number; playerId: number; createdBy: number | null }) {
    const token = newGuardianToken();
    const expiresAt = new Date(Date.now() + GUARDIAN_INVITE_TTL_MS).toISOString();
    await db.insert(guardianInvites).values({
        clubId: params.clubId,
        playerId: params.playerId,
        tokenHash: hashGuardianToken(token),
        createdBy: params.createdBy,
        expiresAt,
    });
    return { token, expiresAt };
}

/** Read-only, for the signup form. */
export async function findUsableGuardianInvite(token: string) {
    if (!looksLikeGuardianInvite(token)) return null;
    const rows = await db
        .select({ invite: guardianInvites, firstName: players.firstName, lastName: players.lastName, clubName: clubs.name })
        .from(guardianInvites)
        .innerJoin(players, eq(players.id, guardianInvites.playerId))
        .leftJoin(clubs, eq(clubs.id, guardianInvites.clubId))
        .where(and(
            eq(guardianInvites.tokenHash, hashGuardianToken(token)),
            isNull(guardianInvites.usedAt),
            gt(guardianInvites.expiresAt, sql`(now() at time zone 'utc')`),
        ))
        .limit(1);
    const hit = rows[0];
    if (!hit) return null;
    return {
        clubId: hit.invite.clubId,
        clubName: hit.clubName ?? null,
        playerId: hit.invite.playerId,
        childName: `${hit.firstName ?? ''} ${hit.lastName ?? ''}`.trim(),
    };
}

/**
 * Atomically marks the invite used and links `userId` to the child. Returns
 * null when the invite is unknown, expired or already used.
 */
export async function redeemGuardianInvite(token: string, userId: number) {
    if (!looksLikeGuardianInvite(token)) return null;
    return db.transaction(async (tx) => {
        const [invite] = await tx.update(guardianInvites)
            .set({ usedAt: new Date().toISOString(), usedBy: userId })
            .where(and(
                eq(guardianInvites.tokenHash, hashGuardianToken(token)),
                isNull(guardianInvites.usedAt),
                gt(guardianInvites.expiresAt, sql`(now() at time zone 'utc')`),
            ))
            .returning();
        if (!invite) return null;
        await tx.insert(playerGuardians)
            .values({ playerId: invite.playerId, userId, createdBy: invite.createdBy })
            .onConflictDoNothing();
        return { clubId: invite.clubId, playerId: invite.playerId };
    });
}
