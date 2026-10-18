import test from 'node:test';
import assert from 'node:assert/strict';
import { parseHandover } from './coachHandover';

test('deactivation states who takes the teams, or leaves them without a coach on purpose', () => {
    assert.deepEqual(parseHandover({}), { decided: false });
    assert.deepEqual(parseHandover({ teamsReassignTo: null }), { decided: true, reassignTo: null });
    assert.deepEqual(parseHandover({ teamsReassignTo: '' }), { decided: true, reassignTo: null });
    assert.deepEqual(parseHandover({ teamsReassignTo: '12' }), { decided: true, reassignTo: 12 });
    assert.ok('error' in parseHandover({ teamsReassignTo: 'x' }));
    assert.ok('error' in parseHandover({ teamsReassignTo: -3 }));
});
