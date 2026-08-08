"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isSuperadmin = isSuperadmin;
exports.resolveRequestClubId = resolveRequestClubId;
exports.assertTeamInClub = assertTeamInClub;
exports.filterIdsToClub = filterIdsToClub;
const requestAuth_1 = require("./requestAuth");
function toClubId(value) {
    if (value == null) {
        return null;
    }
    const parsed = Number(value);
    // A NaN or non-positive id must read as "no club" rather than flow into a query.
    // `WHERE club_id = NaN` either throws or matches nothing, and both failure modes
    // are far harder to spot in production than an outright deny.
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}
function toNumericIds(values) {
    if (!Array.isArray(values)) {
        return [];
    }
    const ids = [];
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
function isSuperadmin(user) {
    return (0, requestAuth_1.normalizeRole)(user === null || user === void 0 ? void 0 : user.role) === 'superadmin';
}
/**
 * The caller's club, or null when they have none.
 *
 * Null means "scope to nothing", never "scope to everything". Callers must treat it
 * as a deny unless the caller is also a superadmin — inverting that is the single
 * easiest way to turn a tenancy fix into a worse tenancy hole.
 */
function resolveRequestClubId(user) {
    return toClubId(user === null || user === void 0 ? void 0 : user.clubId);
}
/**
 * Decide whether a team may be acted on by a caller scoped to `clubId`.
 *
 * `'forbidden'` is deliberately returned for both "team belongs to another club" and
 * "caller has no club", and routes must render it with the same body they use for an
 * insufficient role. Distinguishing those cases would let an attacker probe which
 * team ids exist in other clubs.
 */
function assertTeamInClub(team, clubId, superadmin) {
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
function filterIdsToClub(ids, allowedIds, superadmin) {
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
