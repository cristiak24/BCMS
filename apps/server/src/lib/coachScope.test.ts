import test from 'node:test';
import assert from 'node:assert/strict';
import { coachManagesEvent, coachManagesTeam, teamsManagedByCoach } from './coachScope';

test('a coach manages their own team and unassigned teams only', () => {
    assert.equal(coachManagesTeam(7, 7), true);
    assert.equal(coachManagesTeam(null, 7), true);
    assert.equal(coachManagesTeam(8, 7), false);
    assert.equal(coachManagesTeam('7', 7), true);
});

test('an event assignment grants that event on another coach\'s team', () => {
    assert.equal(coachManagesEvent(8, 7, 7), true);
    assert.equal(coachManagesEvent(8, 9, 7), false);
    assert.equal(coachManagesEvent(8, null, 7), false);
});

test('a missing user id never matches', () => {
    assert.equal(coachManagesTeam(8, undefined), false);
    assert.equal(coachManagesEvent(8, null, null), false);
});

test('managed teams are filtered from the club list', () => {
    const teams = [{ id: 1, coachId: 7 }, { id: 2, coachId: 8 }, { id: 3, coachId: null }];
    assert.deepEqual(teamsManagedByCoach(teams, 7), [1, 3]);
});
