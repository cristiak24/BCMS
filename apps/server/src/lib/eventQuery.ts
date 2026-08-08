import { filterIdsToClub } from './tenantScope';

/**
 * Query-parameter parsing and team-scope resolution for GET /api/events.
 *
 * Previously the endpoint read every event in the database and applied start/end/
 * type/coachId/teamId in JavaScript. Moving those to SQL means the *semantics* have
 * to be pinned down first, because several of them were accidental properties of the
 * JS comparisons rather than deliberate rules. Everything below reproduces the old
 * behaviour exactly; the notes say where that behaviour is surprising.
 *
 * Pure and dependency-free so the rules are unit-testable without a database.
 */

export type EventQueryParams = {
    start?: unknown;
    end?: unknown;
    type?: unknown;
    coachId?: unknown;
    teamId?: unknown;
};

export type EventQueryScope = {
    isSuperadmin: boolean;
    /** The caller's club team ids, or null for an unrestricted (superadmin) caller. */
    allowedTeamIds: number[] | null;
};

export type EventQueryPlan = {
    /** True → respond `[]` without querying at all. Keeps empty arrays away from inArray. */
    empty: boolean;
    /** Explicit team filter. NULL-team events are excluded when this is set (as before). */
    teamIds: number[] | null;
    /** Tenancy restriction. NULL-team events pass this (as before). null → unrestricted. */
    clubTeamIds: number[] | null;
    type: string | null;
    coachId: number | null;
    start: string | null;
    end: string | null;
};

const EMPTY_PLAN: EventQueryPlan = {
    empty: true,
    teamIds: null,
    clubTeamIds: null,
    type: null,
    coachId: null,
    start: null,
    end: null,
};

/**
 * Collect numeric ids from a query parameter that may arrive as a single value,
 * repeated keys (`?teamId=1&teamId=2` — what apiClient's appendQueryParams emits for
 * arrays), or a comma-separated list. Non-numeric entries are dropped; order of first
 * appearance is preserved.
 */
export function parseIdListParam(value: unknown): number[] {
    if (value == null) {
        return [];
    }

    const raw = Array.isArray(value) ? value : [value];
    const ids: number[] = [];

    for (const entry of raw) {
        for (const piece of String(entry).split(',')) {
            const trimmed = piece.trim();
            if (trimmed === '') {
                continue;
            }
            const parsed = Number(trimmed);
            if (Number.isFinite(parsed) && !ids.includes(parsed)) {
                ids.push(parsed);
            }
        }
    }

    return ids;
}

/**
 * An unparseable date was silently ignored before: `new Date('nonsense')` yields an
 * Invalid Date, and every `<` / `>` comparison against it is false, so the range simply
 * never rejected anything. Returning null here reproduces that rather than letting
 * 'Invalid Date' reach the SQL comparison.
 */
export function parseDateParam(value: unknown): string | null {
    if (value == null || value === '') {
        return null;
    }

    const parsed = new Date(String(Array.isArray(value) ? value[0] : value));
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function firstString(value: unknown): string | null {
    if (value == null) {
        return null;
    }
    const single = Array.isArray(value) ? value[0] : value;
    const text = String(single);
    return text === '' ? null : text;
}

export function buildEventQueryPlan(params: EventQueryParams, scope: EventQueryScope): EventQueryPlan {
    // A non-superadmin without a club is denied outright — never treated as unrestricted.
    if (!scope.isSuperadmin && scope.allowedTeamIds == null) {
        return EMPTY_PLAN;
    }

    const clubTeamIds = scope.isSuperadmin ? null : scope.allowedTeamIds;

    const type = firstString(params.type);

    // `if (coachId && event.coachId !== Number(coachId))` rejected every row when the
    // value was non-numeric, because `x !== NaN` is always true. So a garbage coachId
    // used to yield an empty list, and it still does.
    const rawCoachId = firstString(params.coachId);
    let coachId: number | null = null;
    if (rawCoachId != null) {
        const parsed = Number(rawCoachId);
        if (!Number.isFinite(parsed)) {
            return EMPTY_PLAN;
        }
        coachId = parsed;
    }

    // Same story for teamId: a non-numeric value matched nothing.
    const teamFilterRequested = params.teamId != null && firstString(params.teamId) != null;
    let teamIds: number[] | null = null;

    if (teamFilterRequested) {
        const requested = parseIdListParam(params.teamId);
        if (requested.length === 0) {
            return EMPTY_PLAN;
        }

        // INTERSECTION, never union: filterIdsToClub keeps only the requested ids the
        // caller's club actually owns. Asking for another club's team returns nothing
        // for that team rather than leaking it.
        const permitted = filterIdsToClub(requested, clubTeamIds ?? [], scope.isSuperadmin);
        if (permitted.length === 0) {
            return EMPTY_PLAN;
        }

        teamIds = permitted;
    }

    return {
        empty: false,
        teamIds,
        clubTeamIds: teamIds == null ? clubTeamIds : null,
        type,
        coachId,
        start: parseDateParam(params.start),
        end: parseDateParam(params.end),
    };
}
