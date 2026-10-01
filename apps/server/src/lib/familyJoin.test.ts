import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    foldName,
    generateTeamCode,
    looksLikeTeamCode,
    parseBirthDate,
    parseTeamSignup,
    suggestPlayerMatches,
    teamCodeCandidates,
} from './familyJoin';

const NOW = new Date('2026-10-01T12:00:00Z');

test('team codes: 6 chars, distinct from 8-char club codes', () => {
    assert.match(generateTeamCode(), /^[A-HJKMNP-Z2-9]{6}$/);
    assert.equal(looksLikeTeamCode('u10-4kq7'), false);
    assert.equal(looksLikeTeamCode('4kq7 2m'), true);
    assert.equal(looksLikeTeamCode('K7M4-QX2P'), false);
});

test('lenient lookup maps O→0 and I/L→1 for old hex codes', () => {
    assert.deepEqual(teamCodeCandidates('a1b2c3'), ['A1B2C3']);
    assert.deepEqual(teamCodeCandidates('AOBIC3'), ['AOBIC3', 'A0B1C3']);
});

test('birth dates: both formats, real dates, plausible ages', () => {
    assert.deepEqual(parseBirthDate('2016-03-09', NOW), { ok: true, value: '2016-03-09' });
    assert.deepEqual(parseBirthDate('9.3.2016', NOW), { ok: true, value: '2016-03-09' });
    assert.equal(parseBirthDate('2016-02-30', NOW).ok, false);
    assert.equal(parseBirthDate('2025-01-01', NOW).ok, false);
    assert.equal(parseBirthDate('', NOW).ok, false);
});

test('parent signup needs a phone and at least one complete child', () => {
    assert.equal(parseTeamSignup({ joinAs: 'parent', phone: '', children: [{ firstName: 'A', lastName: 'B', birthDate: '2016-01-01' }] }).ok, false);
    assert.equal(parseTeamSignup({ joinAs: 'parent', phone: '0722 123 456', children: [] }).ok, false);
    assert.equal(parseTeamSignup({ joinAs: 'parent', phone: '0722 123 456', children: [{ firstName: 'Matei', lastName: '', birthDate: '2016-01-01' }] }).ok, false);
    const ok = parseTeamSignup({ joinAs: 'parent', phone: '0722 123 456', children: [{ firstName: ' Matei ', lastName: 'Popescu', birthDate: '01.02.2016' }] });
    assert.ok(ok.ok && ok.value.kind === 'parent' && ok.value.children[0].firstName === 'Matei');
});

test('player signup needs phone and birth date; unknown role rejected', () => {
    assert.ok(parseTeamSignup({ joinAs: 'player', phone: '0722 123 456', birthDate: '2010-05-05' }).ok);
    assert.equal(parseTeamSignup({ joinAs: 'player', phone: '0722 123 456' }).ok, false);
    assert.equal(parseTeamSignup({ joinAs: 'coach', phone: '0722 123 456' }).ok, false);
});

test('names fold diacritics, case and spacing', () => {
    assert.equal(foldName('  Ștefan-Ţugui  ÎNVĂȚ '), 'stefan tugui invat');
});

test('match suggestions: either name order, birth-year conflicts excluded', () => {
    const players = [
        { id: 1, firstName: 'Matei', lastName: 'Popescu', birthYear: 2016 },
        { id: 2, firstName: 'Popescu', lastName: 'Matei', birthYear: null },
        { id: 3, firstName: 'Matei', lastName: 'Popescu', birthYear: 2012 },
        { id: 4, firstName: 'Andrei', lastName: 'Popescu', birthYear: 2016 },
    ];
    const result = suggestPlayerMatches({ firstName: 'matei', lastName: 'POPESCU', birthDate: '2016-04-01' }, players);
    assert.deepEqual(result.map((r) => r.id), [1, 2]);
    assert.equal(result[0].sameBirthYear, true);
});
