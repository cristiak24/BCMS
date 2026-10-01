import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hashGuardianToken, looksLikeGuardianInvite, newGuardianToken } from './guardianInvites';
import { looksLikeTeamCode } from './familyJoin';
import { looksLikeInviteCode } from './clubInviteCodes';

test('guardian tokens are distinct from team codes, club codes and link tokens', () => {
    const token = newGuardianToken();
    assert.equal(looksLikeGuardianInvite(token), true);
    assert.equal(looksLikeTeamCode(token), false);
    assert.equal(looksLikeInviteCode(token), false);
    assert.equal(looksLikeGuardianInvite('a'.repeat(64)), false);
    assert.equal(looksLikeGuardianInvite('K4Q72M'), false);
});

test('only the hash is stored and it is stable', () => {
    const token = newGuardianToken();
    assert.equal(hashGuardianToken(token), hashGuardianToken(` ${token} `));
    assert.notEqual(hashGuardianToken(token), token);
    assert.equal(hashGuardianToken(token).length, 64);
});
