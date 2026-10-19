import test from 'node:test';
import assert from 'node:assert/strict';
import { coachManagesEvent, coachManagesTeam, coachReadsEvent, coachReadsTeam, coachSeesPlayer, teamsManagedByCoach, teamsReadableByCoach } from './coachScope';

test('a coach changes their own team only — a team without a coach is the admin\'s (WP7-F1)', () => {
    assert.equal(coachManagesTeam(7, 7), true);
    assert.equal(coachManagesTeam(null, 7), false);
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
    assert.deepEqual(teamsManagedByCoach(teams, 7), [1]);
    assert.deepEqual(teamsReadableByCoach(teams, 7), [1, 3]);
});

test('a coach still reads a team without a coach and its events (WP4A visibility)', () => {
    assert.equal(coachReadsTeam(null, 7), true);
    assert.equal(coachReadsTeam(8, 7), false);
    assert.equal(coachReadsTeam(null, null), false);
    assert.equal(coachReadsEvent(null, null, 7), true);
    assert.equal(coachReadsEvent(8, 7, 7), true, 'assigned to that one event');
    assert.equal(coachReadsEvent(8, null, 7), false);
    assert.equal(coachManagesEvent(null, null, 7), false, 'but cannot change it');
});

test('a coach sees players of the teams they manage, and players on no team', () => {
    assert.equal(coachSeesPlayer([1], [1, 3]), true);
    assert.equal(coachSeesPlayer([2, 3], [1, 3]), true); // also plays for a managed team
    assert.equal(coachSeesPlayer([], [1]), true); // not on a team yet
    assert.equal(coachSeesPlayer([2], [1, 3]), false); // another squad's player
    assert.equal(coachSeesPlayer([2], []), false);
});
