import { normalizeRole } from './requestAuth';

/**
 * Shared tenant-scoping primitives.
 *
 * Most tenant-owned tables (`players`, `attendance`, `events`, `player_payments`,
 * `l12_documents`) carry no `club_id` of their own — they derive tenancy through
 * `teams.club_id`. That indirection is easy to forget, and every route that forgets
 * it becomes a cross-club read. These helpers are pure and unit-tested so the
 * decision itself cannot regress silently, even where the surrounding route has no
 * test coverage.
 */

/**
 * Shape-tolerant view of an authenticated caller.
 *
 * `middleware/auth.ts` attaches the raw Postgres row while `lib/requestContext.ts`
 * builds an `AppUserContext`, and the two do not agree on field types: `club_id` is
 * an integer column but reaches some paths as a string. Accepting both here is what
 * keeps `'3' === 3` comparisons from silently denying (or, worse, allowing) access.
 */
export type TenantUser = {
    role?: unknown;
    clubId?: unknown;
} | null | undefined;

export type TeamScopeResult = 'ok' | 'not-found' | 'forbidden';

function toClubId(value: unknown): number | null {
    if (value == null) {
        return null;
    }

    const parsed = Number(value);

    // A NaN or non-positive id must read as "no club" rather than flow into a query.
    // `WHERE club_id = NaN` either throws or matches nothing, and both failure modes
    // are far harder to spot in production than an outright deny.
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function toNumericIds(values: unknown): number[] {
    if (!Array.isArray(values)) {
        return [];
    }

    const ids: number[] = [];
    for (const value of values) {
        if (value == null) {
            continue;
        }
        const parsed = Number(value);
        if (Number.isFinite(parsed)) {
            ids.push(parsed);
        }
    }

    return ids;
}

export function isSuperadmin(user: TenantUser): boolean {
    return normalizeRole(user?.role as string | null | undefined) === 'superadmin';
}

/**
 * The caller's club, or null when they have none.
 *
 * Null means "scope to nothing", never "scope to everything". Callers must treat it
 * as a deny unless the caller is also a superadmin — inverting that is the single
 * easiest way to turn a tenancy fix into a worse tenancy hole.
 */
export function resolveRequestClubId(user: TenantUser): number | null {
    return toClubId(user?.clubId);
}

/**
 * Decide whether a team may be acted on by a caller scoped to `clubId`.
 *
 * `'forbidden'` is deliberately returned for both "team belongs to another club" and
 * "caller has no club", and routes must render it with the same body they use for an
 * insufficient role. Distinguishing those cases would let an attacker probe which
 * team ids exist in other clubs.
 */
export function assertTeamInClub(
    team: { clubId?: unknown; [key: string]: unknown } | null | undefined,
    clubId: unknown,
    superadmin: boolean,
): TeamScopeResult {
    if (!team) {
        return 'not-found';
    }

    if (superadmin) {
        return 'ok';
    }

    const callerClubId = toClubId(clubId);
    if (callerClubId == null) {
        return 'forbidden';
    }

    const teamClubId = toClubId(team.clubId);
    if (teamClubId == null) {
        return 'forbidden';
    }

    return teamClubId === callerClubId ? 'ok' : 'forbidden';
}

/**
 * Narrow a set of ids to the ones the caller's club owns.
 *
 * An empty `allowedIds` for a non-superadmin yields `[]` rather than an unfiltered
 * list: a club with no teams must see nothing, and passing an empty array to
 * Drizzle's `inArray` generates invalid `IN ()` SQL anyway.
 */
export function filterIdsToClub(ids: unknown, allowedIds: unknown, superadmin: boolean): number[] {
    const requested = toNumericIds(ids);

    if (superadmin) {
        return requested;
    }

    const allowed = new Set(toNumericIds(allowedIds));
    if (allowed.size === 0) {
        return [];
    }

    return requested.filter((id) => allowed.has(id));
}
