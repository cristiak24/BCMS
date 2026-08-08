import { test } from 'node:test';
import { strict as assert } from 'node:assert';

import { buildEventQueryPlan, parseDateParam, parseIdListParam } from './eventQuery';

const club1 = { isSuperadmin: false, allowedTeamIds: [1, 2, 3] };
const superadmin = { isSuperadmin: true, allowedTeamIds: null };

test('a single teamId parses to a one-element list', () => {
    assert.deepEqual(parseIdListParam('7'), [7]);
    assert.deepEqual(buildEventQueryPlan({ teamId: '2' }, club1).teamIds, [2]);
});

test('repeated teamId params are collected and deduped', () => {
    // apiClient's appendQueryParams emits repeated keys for arrays, so Express hands
    // us a string[].
    assert.deepEqual(parseIdListParam(['1', '2', '1']), [1, 2]);
    assert.deepEqual(buildEventQueryPlan({ teamId: ['1', '2'] }, club1).teamIds, [1, 2]);
});

test('a comma-separated teamId list parses the same way', () => {
    assert.deepEqual(parseIdListParam('1,2,3'), [1, 2, 3]);
    assert.deepEqual(parseIdListParam(['1,2', '3']), [1, 2, 3]);
});

test('non-numeric team entries are dropped rather than becoming NaN', () => {
    assert.deepEqual(parseIdListParam(['1', 'abc', '', '  ', '3']), [1, 3]);
    for (const id of parseIdListParam(['abc', '1'])) {
        assert.ok(Number.isFinite(id));
    }
});

test('a team id from another club is excluded, not unioned in', () => {
    // Club 1 owns teams 1-3. Asking for 9 as well must not widen the result.
    const plan = buildEventQueryPlan({ teamId: ['2', '9'] }, club1);

    assert.equal(plan.empty, false);
    assert.deepEqual(plan.teamIds, [2]);
    assert.equal(plan.teamIds?.includes(9), false);
});

test('requesting only out-of-club teams yields an empty plan, never a query', () => {
    const plan = buildEventQueryPlan({ teamId: ['9', '10'] }, club1);

    assert.equal(plan.empty, true);
    assert.equal(plan.teamIds, null);
});

test('a teamId that parses to nothing yields an empty plan', () => {
    // Previously `event.teamId !== Number('abc')` rejected every row; same outcome.
    assert.equal(buildEventQueryPlan({ teamId: 'abc' }, club1).empty, true);
});

test('a superadmin bypasses the team restriction entirely', () => {
    const unfiltered = buildEventQueryPlan({}, superadmin);
    assert.equal(unfiltered.empty, false);
    assert.equal(unfiltered.clubTeamIds, null);
    assert.equal(unfiltered.teamIds, null);

    // A superadmin may still ask for any specific team, including one club 1 lacks.
    const requested = buildEventQueryPlan({ teamId: ['9'] }, superadmin);
    assert.deepEqual(requested.teamIds, [9]);
});

test('a non-superadmin with no club is denied, never unrestricted', () => {
    const plan = buildEventQueryPlan({}, { isSuperadmin: false, allowedTeamIds: null });

    assert.equal(plan.empty, true);
    assert.equal(plan.clubTeamIds, null);
});

test('a club with no teams still carries a restriction rather than going unrestricted', () => {
    // The controller renders this as `team_id IS NULL` only — club-less events stay
    // visible (as before) and no empty array ever reaches inArray.
    const plan = buildEventQueryPlan({}, { isSuperadmin: false, allowedTeamIds: [] });

    assert.equal(plan.empty, false);
    assert.deepEqual(plan.clubTeamIds, []);
    assert.equal(plan.teamIds, null);
});

test('the club restriction is dropped once an explicit team filter is already scoped', () => {
    // teamIds has been intersected with the club already, so re-applying clubTeamIds
    // would be redundant. Exactly one of the two is ever set.
    const plan = buildEventQueryPlan({ teamId: '2' }, club1);

    assert.deepEqual(plan.teamIds, [2]);
    assert.equal(plan.clubTeamIds, null);
});

test('unparseable start/end are ignored rather than reaching SQL', () => {
    assert.equal(parseDateParam('not-a-date'), null);
    assert.equal(parseDateParam(''), null);
    assert.equal(parseDateParam(undefined), null);

    const plan = buildEventQueryPlan({ start: 'nonsense', end: '2026-03-31T00:00:00.000Z' }, club1);
    assert.equal(plan.start, null);
    assert.equal(plan.end, '2026-03-31T00:00:00.000Z');
});

test('valid dates normalise to ISO strings for the timestamp comparison', () => {
    assert.equal(parseDateParam('2026-03-01'), '2026-03-01T00:00:00.000Z');
    assert.equal(parseDateParam(new Date('2026-03-01T12:00:00Z').toISOString()), '2026-03-01T12:00:00.000Z');
});

test('a non-numeric coachId matches nothing, as it did before', () => {
    assert.equal(buildEventQueryPlan({ coachId: 'abc' }, club1).empty, true);
    assert.equal(buildEventQueryPlan({ coachId: '5' }, club1).coachId, 5);
    assert.equal(buildEventQueryPlan({}, club1).coachId, null);
});

test('type is passed through untouched and absent when not supplied', () => {
    assert.equal(buildEventQueryPlan({ type: 'match' }, club1).type, 'match');
    assert.equal(buildEventQueryPlan({}, club1).type, null);
});
