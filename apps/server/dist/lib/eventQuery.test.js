"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = require("node:test");
const node_assert_1 = require("node:assert");
const eventQuery_1 = require("./eventQuery");
const club1 = { isSuperadmin: false, allowedTeamIds: [1, 2, 3] };
const superadmin = { isSuperadmin: true, allowedTeamIds: null };
(0, node_test_1.test)('a single teamId parses to a one-element list', () => {
    node_assert_1.strict.deepEqual((0, eventQuery_1.parseIdListParam)('7'), [7]);
    node_assert_1.strict.deepEqual((0, eventQuery_1.buildEventQueryPlan)({ teamId: '2' }, club1).teamIds, [2]);
});
(0, node_test_1.test)('repeated teamId params are collected and deduped', () => {
    // apiClient's appendQueryParams emits repeated keys for arrays, so Express hands
    // us a string[].
    node_assert_1.strict.deepEqual((0, eventQuery_1.parseIdListParam)(['1', '2', '1']), [1, 2]);
    node_assert_1.strict.deepEqual((0, eventQuery_1.buildEventQueryPlan)({ teamId: ['1', '2'] }, club1).teamIds, [1, 2]);
});
(0, node_test_1.test)('a comma-separated teamId list parses the same way', () => {
    node_assert_1.strict.deepEqual((0, eventQuery_1.parseIdListParam)('1,2,3'), [1, 2, 3]);
    node_assert_1.strict.deepEqual((0, eventQuery_1.parseIdListParam)(['1,2', '3']), [1, 2, 3]);
});
(0, node_test_1.test)('non-numeric team entries are dropped rather than becoming NaN', () => {
    node_assert_1.strict.deepEqual((0, eventQuery_1.parseIdListParam)(['1', 'abc', '', '  ', '3']), [1, 3]);
    for (const id of (0, eventQuery_1.parseIdListParam)(['abc', '1'])) {
        node_assert_1.strict.ok(Number.isFinite(id));
    }
});
(0, node_test_1.test)('a team id from another club is excluded, not unioned in', () => {
    var _a;
    // Club 1 owns teams 1-3. Asking for 9 as well must not widen the result.
    const plan = (0, eventQuery_1.buildEventQueryPlan)({ teamId: ['2', '9'] }, club1);
    node_assert_1.strict.equal(plan.empty, false);
    node_assert_1.strict.deepEqual(plan.teamIds, [2]);
    node_assert_1.strict.equal((_a = plan.teamIds) === null || _a === void 0 ? void 0 : _a.includes(9), false);
});
(0, node_test_1.test)('requesting only out-of-club teams yields an empty plan, never a query', () => {
    const plan = (0, eventQuery_1.buildEventQueryPlan)({ teamId: ['9', '10'] }, club1);
    node_assert_1.strict.equal(plan.empty, true);
    node_assert_1.strict.equal(plan.teamIds, null);
});
(0, node_test_1.test)('a teamId that parses to nothing yields an empty plan', () => {
    // Previously `event.teamId !== Number('abc')` rejected every row; same outcome.
    node_assert_1.strict.equal((0, eventQuery_1.buildEventQueryPlan)({ teamId: 'abc' }, club1).empty, true);
});
(0, node_test_1.test)('a superadmin bypasses the team restriction entirely', () => {
    const unfiltered = (0, eventQuery_1.buildEventQueryPlan)({}, superadmin);
    node_assert_1.strict.equal(unfiltered.empty, false);
    node_assert_1.strict.equal(unfiltered.clubTeamIds, null);
    node_assert_1.strict.equal(unfiltered.teamIds, null);
    // A superadmin may still ask for any specific team, including one club 1 lacks.
    const requested = (0, eventQuery_1.buildEventQueryPlan)({ teamId: ['9'] }, superadmin);
    node_assert_1.strict.deepEqual(requested.teamIds, [9]);
});
(0, node_test_1.test)('a non-superadmin with no club is denied, never unrestricted', () => {
    const plan = (0, eventQuery_1.buildEventQueryPlan)({}, { isSuperadmin: false, allowedTeamIds: null });
    node_assert_1.strict.equal(plan.empty, true);
    node_assert_1.strict.equal(plan.clubTeamIds, null);
});
(0, node_test_1.test)('a club with no teams still carries a restriction rather than going unrestricted', () => {
    // The controller renders this as `team_id IS NULL` only — club-less events stay
    // visible (as before) and no empty array ever reaches inArray.
    const plan = (0, eventQuery_1.buildEventQueryPlan)({}, { isSuperadmin: false, allowedTeamIds: [] });
    node_assert_1.strict.equal(plan.empty, false);
    node_assert_1.strict.deepEqual(plan.clubTeamIds, []);
    node_assert_1.strict.equal(plan.teamIds, null);
});
(0, node_test_1.test)('the club restriction is dropped once an explicit team filter is already scoped', () => {
    // teamIds has been intersected with the club already, so re-applying clubTeamIds
    // would be redundant. Exactly one of the two is ever set.
    const plan = (0, eventQuery_1.buildEventQueryPlan)({ teamId: '2' }, club1);
    node_assert_1.strict.deepEqual(plan.teamIds, [2]);
    node_assert_1.strict.equal(plan.clubTeamIds, null);
});
(0, node_test_1.test)('unparseable start/end are ignored rather than reaching SQL', () => {
    node_assert_1.strict.equal((0, eventQuery_1.parseDateParam)('not-a-date'), null);
    node_assert_1.strict.equal((0, eventQuery_1.parseDateParam)(''), null);
    node_assert_1.strict.equal((0, eventQuery_1.parseDateParam)(undefined), null);
    const plan = (0, eventQuery_1.buildEventQueryPlan)({ start: 'nonsense', end: '2026-03-31T00:00:00.000Z' }, club1);
    node_assert_1.strict.equal(plan.start, null);
    node_assert_1.strict.equal(plan.end, '2026-03-31T00:00:00.000Z');
});
(0, node_test_1.test)('valid dates normalise to ISO strings for the timestamp comparison', () => {
    node_assert_1.strict.equal((0, eventQuery_1.parseDateParam)('2026-03-01'), '2026-03-01T00:00:00.000Z');
    node_assert_1.strict.equal((0, eventQuery_1.parseDateParam)(new Date('2026-03-01T12:00:00Z').toISOString()), '2026-03-01T12:00:00.000Z');
});
(0, node_test_1.test)('a non-numeric coachId matches nothing, as it did before', () => {
    node_assert_1.strict.equal((0, eventQuery_1.buildEventQueryPlan)({ coachId: 'abc' }, club1).empty, true);
    node_assert_1.strict.equal((0, eventQuery_1.buildEventQueryPlan)({ coachId: '5' }, club1).coachId, 5);
    node_assert_1.strict.equal((0, eventQuery_1.buildEventQueryPlan)({}, club1).coachId, null);
});
(0, node_test_1.test)('type is passed through untouched and absent when not supplied', () => {
    node_assert_1.strict.equal((0, eventQuery_1.buildEventQueryPlan)({ type: 'match' }, club1).type, 'match');
    node_assert_1.strict.equal((0, eventQuery_1.buildEventQueryPlan)({}, club1).type, null);
});
