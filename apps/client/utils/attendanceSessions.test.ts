import { test } from 'node:test';
import { strict as assert } from 'node:assert';

import { defaultSession, splitSessions } from './attendanceSessions';

const s = (id: number, startTime: string) => ({ id, startTime });
// 16 Oct 2026, 12:00 in Romania.
const NOW = new Date('2026-10-16T09:00:00.000Z');

test('upcoming soonest first, past latest first — not one list by distance', () => {
  const sessions = [s(1, '2026-10-08T15:00:00.000Z'), s(2, '2026-10-25T15:00:00.000Z'), s(3, '2026-10-16T15:00:00.000Z'), s(4, '2026-10-14T15:00:00.000Z'), s(5, '2026-10-30T15:00:00.000Z')];
  const { upcoming, past } = splitSessions(sessions, NOW.getTime());
  assert.deepEqual(upcoming.map((x) => x.id), [3, 2, 5]);
  assert.deepEqual(past.map((x) => x.id), [4, 1]);
});

test('opens on a session later today, else the latest past one, else the next one', () => {
  const today = splitSessions([s(1, '2026-10-14T15:00:00.000Z'), s(2, '2026-10-16T15:00:00.000Z'), s(3, '2026-10-25T15:00:00.000Z')], NOW.getTime());
  assert.equal(defaultSession(today, NOW)?.id, 2);
  const noneToday = splitSessions([s(1, '2026-10-14T15:00:00.000Z'), s(3, '2026-10-25T15:00:00.000Z')], NOW.getTime());
  assert.equal(defaultSession(noneToday, NOW)?.id, 1);
  const onlyAhead = splitSessions([s(3, '2026-10-25T15:00:00.000Z')], NOW.getTime());
  assert.equal(defaultSession(onlyAhead, NOW)?.id, 3);
  assert.equal(defaultSession({ upcoming: [], past: [] }, NOW), null);
});
