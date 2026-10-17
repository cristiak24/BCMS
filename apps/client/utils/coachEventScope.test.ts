import { test } from 'node:test';
import { strict as assert } from 'node:assert';

import { getCoachScopedEvents } from '../components/coach/coachUtils';
import type { CalendarEvent } from '../services/eventsApi';
import type { AuthUser } from './authSession';

const COACH = 7;
const OTHER_COACH = 8;

// U12 is coached by COACH, U14 by someone else, U16 has no coach yet.
const teams = [
  { id: 1, coachId: COACH },
  { id: 2, coachId: OTHER_COACH },
  { id: 3, coachId: null },
];

let nextId = 1;
function evt(teamId: number | null, coachId: number | null = null, status = 'scheduled') {
  return {
    id: nextId++, type: 'training', title: 'Antrenament', description: null, location: null,
    startTime: '2026-10-20T15:00:00.000Z', endTime: '2026-10-20T16:30:00.000Z',
    teamId, coachId, amount: null, status,
  } as CalendarEvent;
}

const session = (id: number) => ({ id: String(id), role: 'coach' }) as unknown as AuthUser;
const ids = (events: CalendarEvent[]) => events.map((event) => event.id);

test('a coach sees the sessions of their team that the admin created without a coach', () => {
  const own = evt(1);
  const scoped = getCoachScopedEvents([own, evt(2)], session(COACH), teams);
  assert.deepEqual(ids(scoped), [own.id]);
});

test('a coach sees a session they are assigned to on another team', () => {
  const assigned = evt(2, COACH);
  const scoped = getCoachScopedEvents([assigned, evt(2)], session(COACH), teams);
  assert.deepEqual(ids(scoped), [assigned.id]);
});

test('a coach sees the sessions of a team with no coach, as the server lets them manage it', () => {
  const uncoached = evt(3);
  assert.deepEqual(ids(getCoachScopedEvents([uncoached], session(COACH), teams)), [uncoached.id]);
});

test('a coach with nothing of their own gets nothing, not the whole club', () => {
  const others = [evt(2), evt(2, OTHER_COACH)];
  assert.deepEqual(getCoachScopedEvents(others, session(COACH), teams), []);
});

test('cancelled sessions stay out', () => {
  assert.deepEqual(getCoachScopedEvents([evt(1, null, 'cancelled')], session(COACH), teams), []);
});

test('without a signed-in coach nothing is shown', () => {
  assert.deepEqual(getCoachScopedEvents([evt(1)], null, teams), []);
});
