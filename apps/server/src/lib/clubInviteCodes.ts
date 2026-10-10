import crypto from 'crypto';
import { and, desc, eq, gt, isNull, lt, sql } from 'drizzle-orm';
import { db } from '../db';
import { clubInviteCodes, clubs, teams } from '../db/schema';
import type { InviteRole } from '../types/manageAccess';

/**
 * Short club join codes. Unlike invite links (one active link per role, 64-hex
 * token) these are meant to be read out or typed: 8 characters from an
 * alphabet without look-alikes (no 0/O, 1/I/L), shown as XXXX-XXXX.
 *
 * 31^8 ≈ 8.5e11 combinations; validation is rate limited, and every code
 * expires and has a usage cap, so guessing one is not practical.
 */

const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 8;

export const INVITE_CODE_LIMITS = {
    minHours: 1,
    maxHours: 24 * 90,
    minUses: 1,
    maxUses: 500,
};

export type ClubInviteCodeRecord = {
    id: number;
    clubId: number;
    code: string;
    role: InviteRole;
    teamId: number | null;
    teamName: string | null;
    expiresAt: string;
    maxUses: number;
    useCount: number;
    createdAt: string;
    revokedAt: string | null;
    status: 'active' | 'expired' | 'exhausted' | 'revoked';
};

/** Uppercases and strips spaces/dashes so "k7m4 qx2p" and "K7M4-QX2P" match. */
export function normalizeInviteCode(raw: string) {
    return raw.toUpperCase().replace(/[\s-]/g, '');
}

/** True when the input looks like a short code rather than a 64-hex link token. */
export function looksLikeInviteCode(raw: string) {
    const code = normalizeInviteCode(raw);
    return code.length === CODE_LENGTH && [...code].every((ch) => ALPHABET.includes(ch));
}

export function formatInviteCode(code: string) {
    return `${code.slice(0, 4)}-${code.slice(4)}`;
}

function randomCode() {
    const bytes = crypto.randomBytes(CODE_LENGTH);
    let out = '';
    for (let i = 0; i < CODE_LENGTH; i++) {
        out += ALPHABET[bytes[i] % ALPHABET.length];
    }
    return out;
}

/**
 * `timestamp without time zone` columns come back as "2026-09-28 10:00:00".
 * We write them in UTC, so read them back as UTC: plain `new Date()` would
 * treat them as server-local time and shift expiry by the TZ offset.
 */
function dbTimeToIso(value: string) {
    const hasZone = /[zZ]|[+-]\d{2}:?\d{2}$/.test(value);
    const date = new Date(hasZone ? value : `${value.replace(' ', 'T')}Z`);
    return Number.isNaN(date.getTime()) ? value : date.toISOString();
}

function statusOf(row: { expiresAt: string; maxUses: number; useCount: number; revokedAt: string | null }): ClubInviteCodeRecord['status'] {
    if (row.revokedAt) return 'revoked';
    if (row.useCount >= row.maxUses) return 'exhausted';
    if (new Date(dbTimeToIso(row.expiresAt)).getTime() <= Date.now()) return 'expired';
    return 'active';
}

function toRecord(row: typeof clubInviteCodes.$inferSelect, teamName: string | null = null): ClubInviteCodeRecord {
    return {
        id: row.id,
        clubId: row.clubId,
        code: formatInviteCode(row.code),
        role: row.role as InviteRole,
        teamId: row.teamId ?? null,
        teamName: row.teamId != null ? teamName : null,
        expiresAt: dbTimeToIso(row.expiresAt),
        maxUses: row.maxUses,
        useCount: row.useCount,
        createdAt: dbTimeToIso(row.createdAt),
        revokedAt: row.revokedAt ? dbTimeToIso(row.revokedAt) : null,
        status: statusOf(row),
    };
}

export async function createClubInviteCode(params: {
    clubId: number;
    role: InviteRole;
    teamId?: number | null;
    expiresInHours: number;
    maxUses: number;
    createdBy: number | null;
}) {
    const hours = Math.floor(params.expiresInHours);
    const maxUses = Math.floor(params.maxUses);

    if (!Number.isFinite(hours) || hours < INVITE_CODE_LIMITS.minHours || hours > INVITE_CODE_LIMITS.maxHours) {
        throw new Error(`Valabilitatea trebuie să fie între ${INVITE_CODE_LIMITS.minHours} oră și ${INVITE_CODE_LIMITS.maxHours / 24} zile.`);
    }
    if (!Number.isFinite(maxUses) || maxUses < INVITE_CODE_LIMITS.minUses || maxUses > INVITE_CODE_LIMITS.maxUses) {
        throw new Error(`Numărul de utilizări trebuie să fie între ${INVITE_CODE_LIMITS.minUses} și ${INVITE_CODE_LIMITS.maxUses}.`);
    }

    const expiresAt = new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();

    let teamName: string | null = null;
    if (params.teamId != null) {
        const team = await findClubTeam(params.clubId, params.teamId);
        if (!team) throw new Error('Echipa aleasă nu există în acest club.');
        teamName = team.name;
    }

    // A collision is astronomically unlikely, but the unique index makes a
    // retry the correct response rather than an error.
    for (let attempt = 0; attempt < 5; attempt++) {
        try {
            const inserted = await db.insert(clubInviteCodes).values({
                clubId: params.clubId,
                code: randomCode(),
                role: params.role as any,
                teamId: params.teamId ?? null,
                expiresAt,
                maxUses,
                createdBy: params.createdBy,
            }).returning();
            return toRecord(inserted[0], teamName);
        } catch (error: any) {
            if (error?.code !== '23505') throw error;
        }
    }
    throw new Error('Nu am putut genera un cod unic. Încearcă din nou.');
}

/** An active team of this club, or null — never trust a team id from the client. */
export async function findClubTeam(clubId: number, teamId: number) {
    const rows = await db.select({ id: teams.id, name: teams.name }).from(teams)
        .where(and(eq(teams.id, teamId), eq(teams.clubId, clubId), eq(teams.isActive, true)))
        .limit(1);
    return rows[0] ?? null;
}

export async function listClubInviteCodes(clubId: number) {
    const rows = await db.select({ row: clubInviteCodes, teamName: teams.name }).from(clubInviteCodes)
        .leftJoin(teams, eq(teams.id, clubInviteCodes.teamId))
        .where(eq(clubInviteCodes.clubId, clubId))
        .orderBy(desc(clubInviteCodes.createdAt))
        .limit(50);
    return rows.map(({ row, teamName }) => toRecord(row, teamName));
}

export async function revokeClubInviteCode(clubId: number, id: number) {
    const updated = await db.update(clubInviteCodes)
        .set({ revokedAt: new Date().toISOString() })
        .where(and(eq(clubInviteCodes.id, id), eq(clubInviteCodes.clubId, clubId), isNull(clubInviteCodes.revokedAt)))
        .returning();
    if (!updated[0]) return null;
    const team = updated[0].teamId != null ? await findClubTeam(clubId, updated[0].teamId) : null;
    return toRecord(updated[0], team?.name ?? null);
}

/** Read-only check used by the signup form before the account exists. */
export async function findUsableInviteCode(raw: string) {
    const code = normalizeInviteCode(raw);
    const rows = await db.select({
        row: clubInviteCodes,
        clubName: clubs.name,
        teamName: teams.name,
    }).from(clubInviteCodes)
        .leftJoin(clubs, eq(clubs.id, clubInviteCodes.clubId))
        .leftJoin(teams, eq(teams.id, clubInviteCodes.teamId))
        .where(eq(clubInviteCodes.code, code))
        .limit(1);

    const hit = rows[0];
    if (!hit || statusOf(hit.row) !== 'active') {
        return null;
    }

    return {
        clubId: hit.row.clubId,
        clubName: hit.clubName ?? null,
        role: hit.row.role as InviteRole,
        teamId: hit.row.teamId ?? null,
        teamName: hit.row.teamId != null ? hit.teamName ?? null : null,
        expiresAt: dbTimeToIso(hit.row.expiresAt),
        remainingUses: hit.row.maxUses - hit.row.useCount,
    };
}

/**
 * Atomically takes one use. The WHERE clause re-checks expiry, revocation and
 * the cap inside a single UPDATE, so two people signing up with the last use
 * at the same moment cannot both get in.
 */
export async function consumeInviteCode(raw: string) {
    const code = normalizeInviteCode(raw);
    const updated = await db.update(clubInviteCodes)
        .set({ useCount: sql`${clubInviteCodes.useCount} + 1` })
        .where(and(
            eq(clubInviteCodes.code, code),
            isNull(clubInviteCodes.revokedAt),
            gt(clubInviteCodes.expiresAt, sql`(now() at time zone 'utc')`),
            lt(clubInviteCodes.useCount, clubInviteCodes.maxUses),
        ))
        .returning();

    const row = updated[0];
    return row ? { id: row.id, clubId: row.clubId, role: row.role as InviteRole, teamId: row.teamId ?? null } : null;
}

/** Gives a use back when the signup failed after the code was consumed. */
export async function releaseInviteCodeUse(id: number) {
    await db.update(clubInviteCodes)
        .set({ useCount: sql`greatest(${clubInviteCodes.useCount} - 1, 0)` })
        .where(eq(clubInviteCodes.id, id));
}
