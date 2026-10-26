import test from 'node:test';
import assert from 'node:assert/strict';
import { messageForStatus, userFacingMessage } from './errorMessages';

test('server English becomes Romanian for its status', () => {
  assert.equal(userFacingMessage('Event not found', 404), messageForStatus(404));
  assert.equal(userFacingMessage('Invalid ID', 400), messageForStatus(400));
  assert.equal(userFacingMessage('Internal server error', 500), messageForStatus(500));
  assert.equal(userFacingMessage('Club admin access is required.', 403), messageForStatus(403));
  assert.equal(userFacingMessage('Request failed with status 502', 502), messageForStatus(502));
});

test('Romanian server messages pass through, even without diacritics', () => {
  assert.equal(userFacingMessage('Suma este prea mare.', 400), 'Suma este prea mare.');
  assert.equal(userFacingMessage('Plata a fost deja stornată.', 409), 'Plata a fost deja stornată.');
  assert.equal(userFacingMessage('Timp invalid.', 400), 'Timp invalid.');
  assert.equal(userFacingMessage('Alege un club.', 400), 'Alege un club.');
});

test('an empty body gets the sentence for its status', () => {
  assert.equal(userFacingMessage('', 429), messageForStatus(429));
  assert.equal(userFacingMessage(null, 503), messageForStatus(503));
});
