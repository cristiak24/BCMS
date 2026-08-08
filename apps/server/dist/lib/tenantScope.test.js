"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = require("node:test");
const node_assert_1 = require("node:assert");
const tenantScope_1 = require("./tenantScope");
const superadmin = { role: 'superadmin', clubId: null };
const club1Admin = { role: 'admin', clubId: 1 };
const clublessCoach = { role: 'coach', clubId: null };
(0, node_test_1.test)('identifies superadmins regardless of role casing or padding', () => {
    node_assert_1.strict.equal((0, tenantScope_1.isSuperadmin)(superadmin), true);
    node_assert_1.strict.equal((0, tenantScope_1.isSuperadmin)({ role: '  SuperAdmin ', clubId: null }), true);
    node_assert_1.strict.equal((0, tenantScope_1.isSuperadmin)(club1Admin), false);
    node_assert_1.strict.equal((0, tenantScope_1.isSuperadmin)(clublessCoach), false);
    node_assert_1.strict.equal((0, tenantScope_1.isSuperadmin)(null), false);
    node_assert_1.strict.equal((0, tenantScope_1.isSuperadmin)(undefined), false);
});
(0, node_test_1.test)('resolves a club id from either a number or a string', () => {
    // users.club_id is an integer column but reaches some code paths as a string.
    node_assert_1.strict.equal((0, tenantScope_1.resolveRequestClubId)({ role: 'admin', clubId: 3 }), 3);
    node_assert_1.strict.equal((0, tenantScope_1.resolveRequestClubId)({ role: 'admin', clubId: '3' }), 3);
});
(0, node_test_1.test)('treats a missing or unusable club id as no club, never as all clubs', () => {
    node_assert_1.strict.equal((0, tenantScope_1.resolveRequestClubId)(clublessCoach), null);
    node_assert_1.strict.equal((0, tenantScope_1.resolveRequestClubId)({ role: 'admin', clubId: undefined }), null);
    node_assert_1.strict.equal((0, tenantScope_1.resolveRequestClubId)({ role: 'admin', clubId: 'abc' }), null);
    node_assert_1.strict.equal((0, tenantScope_1.resolveRequestClubId)({ role: 'admin', clubId: 0 }), null);
    node_assert_1.strict.equal((0, tenantScope_1.resolveRequestClubId)(null), null);
});
(0, node_test_1.test)('superadmin bypasses the team ownership check', () => {
    const otherClubTeam = { id: 9, clubId: 2 };
    node_assert_1.strict.equal((0, tenantScope_1.assertTeamInClub)(otherClubTeam, (0, tenantScope_1.resolveRequestClubId)(superadmin), (0, tenantScope_1.isSuperadmin)(superadmin)), 'ok');
    node_assert_1.strict.equal((0, tenantScope_1.assertTeamInClub)({ id: 9, clubId: null }, null, true), 'ok');
});
(0, node_test_1.test)('admin in club 1 is allowed their own team', () => {
    node_assert_1.strict.equal((0, tenantScope_1.assertTeamInClub)({ id: 5, clubId: 1 }, 1, false), 'ok');
});
(0, node_test_1.test)('admin in club 1 is denied a club 2 team', () => {
    node_assert_1.strict.equal((0, tenantScope_1.assertTeamInClub)({ id: 5, clubId: 2 }, 1, false), 'forbidden');
});
(0, node_test_1.test)('string and number club ids compare as equal on both sides', () => {
    node_assert_1.strict.equal((0, tenantScope_1.assertTeamInClub)({ id: 5, clubId: '1' }, 1, false), 'ok');
    node_assert_1.strict.equal((0, tenantScope_1.assertTeamInClub)({ id: 5, clubId: 1 }, '1', false), 'ok');
    node_assert_1.strict.equal((0, tenantScope_1.assertTeamInClub)({ id: 5, clubId: '1' }, '1', false), 'ok');
    node_assert_1.strict.equal((0, tenantScope_1.assertTeamInClub)({ id: 5, clubId: '2' }, '1', false), 'forbidden');
});
(0, node_test_1.test)('a club-less non-superadmin is denied, not treated as unrestricted', () => {
    const clubId = (0, tenantScope_1.resolveRequestClubId)(clublessCoach);
    node_assert_1.strict.equal(clubId, null);
    node_assert_1.strict.equal((0, tenantScope_1.assertTeamInClub)({ id: 5, clubId: 1 }, clubId, (0, tenantScope_1.isSuperadmin)(clublessCoach)), 'forbidden');
});
(0, node_test_1.test)('a club-less superadmin is still allowed', () => {
    node_assert_1.strict.equal((0, tenantScope_1.assertTeamInClub)({ id: 5, clubId: 1 }, (0, tenantScope_1.resolveRequestClubId)(superadmin), (0, tenantScope_1.isSuperadmin)(superadmin)), 'ok');
});
(0, node_test_1.test)('a missing or undefined team reports not-found', () => {
    node_assert_1.strict.equal((0, tenantScope_1.assertTeamInClub)(undefined, 1, false), 'not-found');
    node_assert_1.strict.equal((0, tenantScope_1.assertTeamInClub)(null, 1, false), 'not-found');
    node_assert_1.strict.equal((0, tenantScope_1.assertTeamInClub)(undefined, null, true), 'not-found');
});
(0, node_test_1.test)('a team with no club is denied to everyone except a superadmin', () => {
    // An orphaned team has no club to scope the caller against, so there is no club
    // membership that could justify access.
    node_assert_1.strict.equal((0, tenantScope_1.assertTeamInClub)({ id: 5, clubId: null }, 1, false), 'forbidden');
    node_assert_1.strict.equal((0, tenantScope_1.assertTeamInClub)({ id: 5, clubId: null }, 1, true), 'ok');
});
(0, node_test_1.test)('wrong-club and club-less denials are indistinguishable to the caller', () => {
    // Both must render as the same 403 body, or team ids in other clubs become
    // probeable by diffing responses.
    const wrongClub = (0, tenantScope_1.assertTeamInClub)({ id: 5, clubId: 2 }, 1, false);
    const noClub = (0, tenantScope_1.assertTeamInClub)({ id: 5, clubId: 2 }, null, false);
    node_assert_1.strict.equal(wrongClub, 'forbidden');
    node_assert_1.strict.equal(wrongClub, noClub);
});
(0, node_test_1.test)('filterIdsToClub drops ids outside the caller club', () => {
    node_assert_1.strict.deepEqual((0, tenantScope_1.filterIdsToClub)([1, 2, 3], [1, 3], false), [1, 3]);
    node_assert_1.strict.deepEqual((0, tenantScope_1.filterIdsToClub)([4, 5], [1, 3], false), []);
});
(0, node_test_1.test)('filterIdsToClub returns everything requested for a superadmin', () => {
    node_assert_1.strict.deepEqual((0, tenantScope_1.filterIdsToClub)([1, 2, 3], [], true), [1, 2, 3]);
});
(0, node_test_1.test)('an empty allowed set returns nothing rather than an unfiltered list', () => {
    // A club with no teams must get [], and an empty array must never reach
    // Drizzle's inArray, which would emit invalid `IN ()` SQL.
    node_assert_1.strict.deepEqual((0, tenantScope_1.filterIdsToClub)([1, 2, 3], [], false), []);
    node_assert_1.strict.deepEqual((0, tenantScope_1.filterIdsToClub)([1, 2, 3], null, false), []);
    node_assert_1.strict.deepEqual((0, tenantScope_1.filterIdsToClub)([1, 2, 3], undefined, false), []);
});
(0, node_test_1.test)('filterIdsToClub with empty input returns an empty list', () => {
    node_assert_1.strict.deepEqual((0, tenantScope_1.filterIdsToClub)([], [1, 2], false), []);
    node_assert_1.strict.deepEqual((0, tenantScope_1.filterIdsToClub)([], [1, 2], true), []);
});
(0, node_test_1.test)('filterIdsToClub matches ids across string and number forms', () => {
    node_assert_1.strict.deepEqual((0, tenantScope_1.filterIdsToClub)(['1', 2], [1, '2'], false), [1, 2]);
});
(0, node_test_1.test)('filterIdsToClub handles NaN, null and undefined inputs without throwing', () => {
    node_assert_1.strict.deepEqual((0, tenantScope_1.filterIdsToClub)([NaN, null, undefined, 2], [2], false), [2]);
    node_assert_1.strict.deepEqual((0, tenantScope_1.filterIdsToClub)(null, [1], false), []);
    node_assert_1.strict.deepEqual((0, tenantScope_1.filterIdsToClub)(undefined, [1], false), []);
    node_assert_1.strict.deepEqual((0, tenantScope_1.filterIdsToClub)('not-an-array', [1], false), []);
    node_assert_1.strict.deepEqual((0, tenantScope_1.filterIdsToClub)([1, 2], ['abc', NaN], false), []);
});
