import { test } from 'node:test';
import { strict as assert } from 'node:assert';

import {
    MAX_ATTENDANCE_ITEMS,
    normalizeAttendanceStatus,
    parseAttendancePayload,
    parseDate,
    parseEventInput,
} from './eventValidation';

test('attendance: accepts known statuses and normalises legacy "prezent"', () => {
    assert.equal(normalizeAttendanceStatus('Present'), 'present');
    assert.equal(normalizeAttendanceStatus('prezent'), 'present');
    assert.equal(normalizeAttendanceStatus(' medical '), 'medical');
    assert.equal(normalizeAttendanceStatus('hacked'), null);
    assert.equal(normalizeAttendanceStatus(undefined), null);
});

test('attendance: rejects a non-array, empty or oversized payload', () => {
    assert.equal(parseAttendancePayload({}).ok, false);
    assert.equal(parseAttendancePayload({ playerAttendances: [] }).ok, false);
    const tooMany = Array.from({ length: MAX_ATTENDANCE_ITEMS + 1 }, (_, i) => ({ playerId: i + 1, status: 'present' }));
    assert.equal(parseAttendancePayload({ playerAttendances: tooMany }).ok, false);
});

test('attendance: rejects bad player ids and unknown statuses', () => {
    assert.equal(parseAttendancePayload({ playerAttendances: [{ playerId: 'abc', status: 'present' }] }).ok, false);
    assert.equal(parseAttendancePayload({ playerAttendances: [{ playerId: -1, status: 'present' }] }).ok, false);
    assert.equal(parseAttendancePayload({ playerAttendances: [{ playerId: 3, status: '<script>' }] }).ok, false);
});

test('attendance: keeps "note absent" distinct from "note cleared"', () => {
    const result = parseAttendancePayload({
        playerAttendances: [
            { playerId: 1, status: 'present' },
            { playerId: 2, status: 'absent', note: null },
            { playerId: 3, status: 'medical', note: '  Entorsă  ' },
            { playerId: 4, status: 'present', note: '   ' },
        ],
    });
    assert.ok(result.ok);
    assert.deepEqual(result.data.map((item) => item.note), [undefined, null, 'Entorsă', null]);
});

test('attendance: duplicate player ids collapse to the last entry', () => {
    const result = parseAttendancePayload({
        playerAttendances: [
            { playerId: 5, status: 'absent' },
            { playerId: 5, status: 'present' },
        ],
    });
    assert.ok(result.ok);
    assert.equal(result.data.length, 1);
    assert.equal(result.data[0].status, 'present');
});

test('event create: requires title, valid dates and a team', () => {
    const base = { title: 'Antrenament', startTime: '2026-10-01T16:00:00Z', endTime: '2026-10-01T18:00:00Z', teamId: 3 };
    assert.ok(parseEventInput(base, 'create').ok);
    assert.equal(parseEventInput({ ...base, title: '  ' }, 'create').ok, false);
    assert.equal(parseEventInput({ ...base, startTime: 'not a date' }, 'create').ok, false);
    assert.equal(parseEventInput({ ...base, teamId: null }, 'create').ok, false);
    assert.equal(parseEventInput({ ...base, type: 'party' }, 'create').ok, false);
});

test('event create: defaults type/status and rejects end before start', () => {
    const result = parseEventInput({ title: 'X', startTime: '2026-10-01T16:00:00Z', endTime: '2026-10-01T18:00:00Z', teamId: 1 }, 'create');
    assert.ok(result.ok);
    assert.equal(result.data.type, 'training');
    assert.equal(result.data.status, 'scheduled');

    const backwards = parseEventInput({ title: 'X', startTime: '2026-10-01T18:00:00Z', endTime: '2026-10-01T16:00:00Z', teamId: 1 }, 'create');
    assert.equal(backwards.ok, false);
});

test('event update: only sent fields are returned, unknown fields dropped', () => {
    const result = parseEventInput({ title: ' Meci ', clubId: 9, id: 1 }, 'update');
    assert.ok(result.ok);
    assert.deepEqual(result.data, { title: 'Meci' });
});

test('event update: an end moved before the stored start is rejected', () => {
    const existing = { startTime: '2026-10-01 16:00:00', endTime: '2026-10-01 18:00:00' };
    assert.equal(parseEventInput({ endTime: '2026-10-01T10:00:00Z' }, 'update', existing).ok, false);
    // The stored start is UTC text: an end of 17:00Z is after a 16:00 UTC start
    // in every process zone (it used to be compared in local time).
    assert.equal(parseEventInput({ endTime: '2026-10-01T17:00:00Z' }, 'update', existing).ok, true);
});

test('parseDate: a zone-less date-time is refused (audit P0-3)', () => {
    for (const value of ['2026-10-22T19:00:00', '2026-10-22 19:00:00', '2026-10-22T19:00', '2026-10-22', 1761152400000]) {
        const result = parseDate(value, 'startTime');
        assert.equal(result.ok, false, String(value));
    }
    const naive = parseEventInput({ title: 'X', startTime: '2026-10-22T19:00:00', endTime: '2026-10-22T20:30:00', teamId: 1 }, 'create');
    assert.equal(naive.ok, false);
    assert.match(naive.ok ? '' : naive.error, /time zone/);
});

test('parseDate: Z and numeric offsets are accepted and normalised to UTC', () => {
    assert.deepEqual(parseDate('2026-10-22T16:00:00.000Z', 'startTime'), { ok: true, data: '2026-10-22T16:00:00.000Z' });
    assert.deepEqual(parseDate('2026-10-22T19:00:00+03:00', 'startTime'), { ok: true, data: '2026-10-22T16:00:00.000Z' });
    assert.deepEqual(parseDate('2027-01-14T19:00+0200', 'startTime'), { ok: true, data: '2027-01-14T17:00:00.000Z' });
    assert.equal(parseDate('2026-10-22T25:00:00Z', 'startTime').ok, false);
    assert.equal(parseDate('', 'startTime').ok, false);
    assert.equal(parseDate(null, 'startTime').ok, false);
});

test('event update: an empty body is rejected rather than a no-op success', () => {
    assert.equal(parseEventInput({ nothing: true }, 'update').ok, false);
});

test('event update: invalid date is a validation error, not a throw', () => {
    const result = parseEventInput({ startTime: 'garbage' }, 'update');
    assert.equal(result.ok, false);
});

test('event amount: beyond numeric(12,2) is a 400, not a database error', () => {
    const base = { title: 'Turneu', startTime: '2026-10-01T16:00:00Z', endTime: '2026-10-01T18:00:00Z', teamId: 3 };
    assert.ok(parseEventInput({ ...base, amount: 50 }, 'create').ok);
    assert.equal(parseEventInput({ ...base, amount: 99999999999 }, 'create').ok, false);
});
