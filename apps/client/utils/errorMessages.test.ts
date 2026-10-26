import test from 'node:test';
import assert from 'node:assert/strict';
import { loadFailureMessage, messageForStatus, userFacingMessage } from './errorMessages';

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

test('a failed load hides the server\'s own text for a 5xx or a broken reply', () => {
  const apiError = (message: string, status: number) => Object.assign(new Error(message), { status });
  assert.equal(loadFailureMessage(apiError('boom: connection reset', 500)), messageForStatus(500));
  assert.equal(loadFailureMessage(new SyntaxError('Unexpected token <')), messageForStatus(500));
  assert.equal(loadFailureMessage(apiError('Nu ai acces la această acțiune.', 403)), 'Nu ai acces la această acțiune.');
  assert.equal(loadFailureMessage(apiError('Nu ne putem conecta la server.', 0)), 'Nu ne putem conecta la server.');
});
