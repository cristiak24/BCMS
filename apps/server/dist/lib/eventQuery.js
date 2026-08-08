"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseIdListParam = parseIdListParam;
exports.parseDateParam = parseDateParam;
exports.buildEventQueryPlan = buildEventQueryPlan;
const tenantScope_1 = require("./tenantScope");
const EMPTY_PLAN = {
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
function parseIdListParam(value) {
    if (value == null) {
        return [];
    }
    const raw = Array.isArray(value) ? value : [value];
    const ids = [];
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
function parseDateParam(value) {
    if (value == null || value === '') {
        return null;
    }
    const parsed = new Date(String(Array.isArray(value) ? value[0] : value));
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}
function firstString(value) {
    if (value == null) {
        return null;
    }
    const single = Array.isArray(value) ? value[0] : value;
    const text = String(single);
    return text === '' ? null : text;
}
function buildEventQueryPlan(params, scope) {
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
    let coachId = null;
    if (rawCoachId != null) {
        const parsed = Number(rawCoachId);
        if (!Number.isFinite(parsed)) {
            return EMPTY_PLAN;
        }
        coachId = parsed;
    }
    // Same story for teamId: a non-numeric value matched nothing.
    const teamFilterRequested = params.teamId != null && firstString(params.teamId) != null;
    let teamIds = null;
    if (teamFilterRequested) {
        const requested = parseIdListParam(params.teamId);
        if (requested.length === 0) {
            return EMPTY_PLAN;
        }
        // INTERSECTION, never union: filterIdsToClub keeps only the requested ids the
        // caller's club actually owns. Asking for another club's team returns nothing
        // for that team rather than leaking it.
        const permitted = (0, tenantScope_1.filterIdsToClub)(requested, clubTeamIds !== null && clubTeamIds !== void 0 ? clubTeamIds : [], scope.isSuperadmin);
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
