import test from 'node:test';
import assert from 'node:assert/strict';
import { countResponses, eventNoun, eventTakesResponses, parseResponseInput, responsesOpen, shouldNotifyDecline } from './eventResponses';

test('answers are taken until the start instant', () => {
    const now = new Date('2026-11-25T15:59:59Z');
    assert.equal(responsesOpen('2026-11-25 16:00:00', now), true);
    assert.equal(responsesOpen('2026-11-25 16:00:00', new Date('2026-11-25T16:00:00Z')), false);
    assert.equal(responsesOpen(null, now), false);
});

test('only trainings, matches and camps of a team, not cancelled', () => {
    assert.equal(eventTakesResponses({ type: 'training', teamId: 1 }), true);
    assert.equal(eventTakesResponses({ type: 'camp', teamId: 1, status: 'scheduled' }), true);
    assert.equal(eventTakesResponses({ type: 'admin', teamId: 1 }), false);
    assert.equal(eventTakesResponses({ type: 'medical', teamId: 1 }), false);
    assert.equal(eventTakesResponses({ type: 'match', teamId: null }), false);
    assert.equal(eventTakesResponses({ type: 'match', teamId: 1, status: 'Cancelled' }), false);
});

test('the body: a known status, a reason only with „Nu vin”, at most 200 characters', () => {
    assert.deepEqual(parseResponseInput({ status: 'not_going', reason: '  Răcit \n azi ' }), { ok: true, value: { status: 'not_going', reason: 'Răcit azi' } });
    assert.deepEqual(parseResponseInput({ status: 'not_going', reason: '   ' }), { ok: true, value: { status: 'not_going', reason: null } });
    assert.deepEqual(parseResponseInput({ status: 'going', reason: 'x' }), { ok: true, value: { status: 'going', reason: null } });
    assert.equal(parseResponseInput({ status: 'yes' }).ok, false);
    assert.equal(parseResponseInput(null).ok, false);
    assert.equal(parseResponseInput({ status: 'not_going', reason: 5 }).ok, false);
    assert.equal(parseResponseInput({ status: 'not_going', reason: 'a'.repeat(201) }).ok, false);
    assert.equal(parseResponseInput({ status: 'not_going', reason: 'a'.repeat(200) }).ok, true);
});

test('counts and the one „Nu vin” notice', () => {
    assert.deepEqual(countResponses(['going', 'not_going', 'maybe', null, 'going', undefined]), { going: 2, notGoing: 1, maybe: 1, none: 2 });
    assert.equal(shouldNotifyDecline(null, 'not_going', false), true);
    assert.equal(shouldNotifyDecline('going', 'not_going', false), true);
    assert.equal(shouldNotifyDecline('not_going', 'not_going', false), false, 'only a reason changed');
    assert.equal(shouldNotifyDecline('going', 'not_going', true), false, 'already told about this event');
    assert.equal(shouldNotifyDecline(null, 'maybe', false), false);
    assert.equal(eventNoun('match'), 'meciul');
    assert.equal(eventNoun('training'), 'antrenamentul');
});
