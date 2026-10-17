// The form runs in the user's time zone; pin it so the offsets are known.
process.env.TZ = 'Europe/Bucharest';

import { test } from 'node:test';
import { strict as assert } from 'node:assert';

import { buildEventUpdate, eventToFormValues } from './eventEditForm';

const training = {
  type: 'training',
  title: 'Antrenament U12',
  description: null,
  location: 'Sala Polivalentă',
  // 19:00 in Bucharest (UTC+3 in October).
  startTime: '2026-10-22T16:00:00.000Z',
  endTime: '2026-10-22T17:30:00.000Z',
  teamId: 1,
  amount: null,
};

test('an event opens in the form at its local date and time', () => {
  const values = eventToFormValues(training);
  assert.equal(values.startTime, '19:00');
  assert.equal(values.endTime, '20:30');
  assert.equal(values.startDate.getDate(), 22);
  assert.equal(values.description, '');
  assert.equal(values.amount, '');
});

test('saving without changes sends back the same instants, with an offset', () => {
  const body = buildEventUpdate(eventToFormValues(training), { includeAmount: false });
  assert.equal(body.startTime, '2026-10-22T16:00:00.000Z');
  assert.equal(body.endTime, '2026-10-22T17:30:00.000Z');
  assert.equal('amount' in body, false);
});

test('a new time is the local time the user picked', () => {
  const values = { ...eventToFormValues(training), startTime: '18:00', endTime: '19:15' };
  const body = buildEventUpdate(values, { includeAmount: false });
  assert.equal(body.startTime, '2026-10-22T15:00:00.000Z');
  assert.equal(body.endTime, '2026-10-22T16:15:00.000Z');
});

test('winter time is UTC+2', () => {
  const values = { ...eventToFormValues(training), startDate: new Date(2026, 11, 3), startTime: '19:00', endTime: '20:00' };
  const body = buildEventUpdate(values, { includeAmount: false });
  assert.equal(body.startTime, '2026-12-03T17:00:00.000Z');
});

test('a training ends on the day it starts; a camp keeps its end date', () => {
  const values = { ...eventToFormValues(training), endDate: new Date(2026, 9, 24) };
  assert.equal(buildEventUpdate(values, { includeAmount: false }).endTime, '2026-10-22T17:30:00.000Z');
  assert.equal(buildEventUpdate({ ...values, type: 'camp' }, { includeAmount: false }).endTime, '2026-10-24T17:30:00.000Z');
});

test('the fee is sent only when allowed, as a number or null', () => {
  const values = { ...eventToFormValues({ ...training, type: 'camp', amount: 150 }) };
  assert.equal(values.amount, '150');
  assert.equal(buildEventUpdate({ ...values, amount: '175,5' }, { includeAmount: true }).amount, 175.5);
  assert.equal(buildEventUpdate({ ...values, amount: '' }, { includeAmount: true }).amount, null);
  assert.equal('amount' in buildEventUpdate(values, { includeAmount: false }), false);
});

test('text fields are trimmed and empty ones cleared', () => {
  const values = { ...eventToFormValues(training), title: '  Antrenament  ', location: '  ', description: '' };
  const body = buildEventUpdate(values, { includeAmount: false });
  assert.equal(body.title, 'Antrenament');
  assert.equal(body.location, null);
  assert.equal(body.description, null);
});
