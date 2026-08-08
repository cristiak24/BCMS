import { test } from 'node:test';
import { strict as assert } from 'node:assert';

import {
    assertTeamInClub,
    filterIdsToClub,
    isSuperadmin,
    resolveRequestClubId,
} from './tenantScope';

const superadmin = { role: 'superadmin', clubId: null };
const club1Admin = { role: 'admin', clubId: 1 };
const clublessCoach = { role: 'coach', clubId: null };

test('identifies superadmins regardless of role casing or padding', () => {
    assert.equal(isSuperadmin(superadmin), true);
    assert.equal(isSuperadmin({ role: '  SuperAdmin ', clubId: null }), true);
    assert.equal(isSuperadmin(club1Admin), false);
    assert.equal(isSuperadmin(clublessCoach), false);
    assert.equal(isSuperadmin(null), false);
    assert.equal(isSuperadmin(undefined), false);
});

test('resolves a club id from either a number or a string', () => {
    // users.club_id is an integer column but reaches some code paths as a string.
    assert.equal(resolveRequestClubId({ role: 'admin', clubId: 3 }), 3);
    assert.equal(resolveRequestClubId({ role: 'admin', clubId: '3' }), 3);
});

test('treats a missing or unusable club id as no club, never as all clubs', () => {
    assert.equal(resolveRequestClubId(clublessCoach), null);
    assert.equal(resolveRequestClubId({ role: 'admin', clubId: undefined }), null);
    assert.equal(resolveRequestClubId({ role: 'admin', clubId: 'abc' }), null);
    assert.equal(resolveRequestClubId({ role: 'admin', clubId: 0 }), null);
    assert.equal(resolveRequestClubId(null), null);
});

test('superadmin bypasses the team ownership check', () => {
    const otherClubTeam = { id: 9, clubId: 2 };

    assert.equal(assertTeamInClub(otherClubTeam, resolveRequestClubId(superadmin), isSuperadmin(superadmin)), 'ok');
    assert.equal(assertTeamInClub({ id: 9, clubId: null }, null, true), 'ok');
});

test('admin in club 1 is allowed their own team', () => {
    assert.equal(assertTeamInClub({ id: 5, clubId: 1 }, 1, false), 'ok');
});

test('admin in club 1 is denied a club 2 team', () => {
    assert.equal(assertTeamInClub({ id: 5, clubId: 2 }, 1, false), 'forbidden');
});

test('string and number club ids compare as equal on both sides', () => {
    assert.equal(assertTeamInClub({ id: 5, clubId: '1' }, 1, false), 'ok');
    assert.equal(assertTeamInClub({ id: 5, clubId: 1 }, '1', false), 'ok');
    assert.equal(assertTeamInClub({ id: 5, clubId: '1' }, '1', false), 'ok');
    assert.equal(assertTeamInClub({ id: 5, clubId: '2' }, '1', false), 'forbidden');
});

test('a club-less non-superadmin is denied, not treated as unrestricted', () => {
    const clubId = resolveRequestClubId(clublessCoach);

    assert.equal(clubId, null);
    assert.equal(assertTeamInClub({ id: 5, clubId: 1 }, clubId, isSuperadmin(clublessCoach)), 'forbidden');
});

test('a club-less superadmin is still allowed', () => {
    assert.equal(
        assertTeamInClub({ id: 5, clubId: 1 }, resolveRequestClubId(superadmin), isSuperadmin(superadmin)),
        'ok',
    );
});

test('a missing or undefined team reports not-found', () => {
    assert.equal(assertTeamInClub(undefined, 1, false), 'not-found');
    assert.equal(assertTeamInClub(null, 1, false), 'not-found');
    assert.equal(assertTeamInClub(undefined, null, true), 'not-found');
});

test('a team with no club is denied to everyone except a superadmin', () => {
    // An orphaned team has no club to scope the caller against, so there is no club
    // membership that could justify access.
    assert.equal(assertTeamInClub({ id: 5, clubId: null }, 1, false), 'forbidden');
    assert.equal(assertTeamInClub({ id: 5, clubId: null }, 1, true), 'ok');
});

test('wrong-club and club-less denials are indistinguishable to the caller', () => {
    // Both must render as the same 403 body, or team ids in other clubs become
    // probeable by diffing responses.
    const wrongClub = assertTeamInClub({ id: 5, clubId: 2 }, 1, false);
    const noClub = assertTeamInClub({ id: 5, clubId: 2 }, null, false);

    assert.equal(wrongClub, 'forbidden');
    assert.equal(wrongClub, noClub);
});

test('filterIdsToClub drops ids outside the caller club', () => {
    assert.deepEqual(filterIdsToClub([1, 2, 3], [1, 3], false), [1, 3]);
    assert.deepEqual(filterIdsToClub([4, 5], [1, 3], false), []);
});

test('filterIdsToClub returns everything requested for a superadmin', () => {
    assert.deepEqual(filterIdsToClub([1, 2, 3], [], true), [1, 2, 3]);
});

test('an empty allowed set returns nothing rather than an unfiltered list', () => {
    // A club with no teams must get [], and an empty array must never reach
    // Drizzle's inArray, which would emit invalid `IN ()` SQL.
    assert.deepEqual(filterIdsToClub([1, 2, 3], [], false), []);
    assert.deepEqual(filterIdsToClub([1, 2, 3], null, false), []);
    assert.deepEqual(filterIdsToClub([1, 2, 3], undefined, false), []);
});

test('filterIdsToClub with empty input returns an empty list', () => {
    assert.deepEqual(filterIdsToClub([], [1, 2], false), []);
    assert.deepEqual(filterIdsToClub([], [1, 2], true), []);
});

test('filterIdsToClub matches ids across string and number forms', () => {
    assert.deepEqual(filterIdsToClub(['1', 2], [1, '2'], false), [1, 2]);
});

test('filterIdsToClub handles NaN, null and undefined inputs without throwing', () => {
    assert.deepEqual(filterIdsToClub([NaN, null, undefined, 2], [2], false), [2]);
    assert.deepEqual(filterIdsToClub(null, [1], false), []);
    assert.deepEqual(filterIdsToClub(undefined, [1], false), []);
    assert.deepEqual(filterIdsToClub('not-an-array', [1], false), []);
    assert.deepEqual(filterIdsToClub([1, 2], ['abc', NaN], false), []);
});
