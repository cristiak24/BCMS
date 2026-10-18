import { test } from 'node:test';
import { strict as assert } from 'node:assert';

import { activityLabel, isOngoing, upcomingActivities } from './homeAgenda';

const NOW = Date.parse('2026-10-20T12:00:00.000Z');
const ev = (type: string, start: string, end: string, status = 'scheduled') => ({ type, startTime: start, endTime: end, status });

test('camps, medical and admin entries are listed with trainings; matches are not', () => {
  const list = upcomingActivities([
    ev('match', '2026-10-21T15:00:00Z', '2026-10-21T17:00:00Z'),
    ev('camp', '2026-10-24T06:00:00Z', '2026-10-27T16:00:00Z'),
    ev('training', '2026-10-22T15:00:00Z', '2026-10-22T16:30:00Z'),
    ev('medical', '2026-10-23T07:00:00Z', '2026-10-23T08:00:00Z'),
    ev('admin', '2026-10-25T07:00:00Z', '2026-10-25T08:00:00Z'),
  ], NOW);
  assert.deepEqual(list.map((e) => e.type), ['training', 'medical', 'camp', 'admin']);
});

test('a camp under way stays listed until it ends; past and cancelled ones do not', () => {
  const running = ev('camp', '2026-10-18T06:00:00Z', '2026-10-22T16:00:00Z');
  const list = upcomingActivities([
    running,
    ev('camp', '2026-10-10T06:00:00Z', '2026-10-12T16:00:00Z'),
    ev('training', '2026-10-21T15:00:00Z', '2026-10-21T16:30:00Z', 'cancelled'),
  ], NOW);
  assert.deepEqual(list, [running]);
  assert.equal(isOngoing(running, NOW), true);
  assert.equal(isOngoing(ev('training', '2026-10-21T15:00:00Z', '2026-10-21T16:30:00Z'), NOW), false);
});

test('each type has a Romanian label', () => {
  assert.equal(activityLabel('camp'), 'Cantonament');
  assert.equal(activityLabel('training'), 'Antrenament');
  assert.equal(activityLabel('medical'), 'Vizită medicală');
  assert.equal(activityLabel('admin'), 'Administrativ');
  assert.equal(activityLabel('???'), 'Activitate');
});
