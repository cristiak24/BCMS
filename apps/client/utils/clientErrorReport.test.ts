import { test } from 'node:test';
import { strict as assert } from 'node:assert';

import { buildClientErrorPayload, buildIdFromScripts, createReportGate, isIgnoredClientError } from './clientErrorReport';

test('a render crash becomes a payload with frames and the component stack, path without query', () => {
  const error = new TypeError("Cannot read properties of undefined (reading 'name')");
  error.stack = "TypeError: Cannot read properties of undefined (reading 'name')\n    at Row (https://bcms.ro/assets/Lot-abc.js:1:200)\n    at renderWithHooks (https://bcms.ro/assets/index-x.js:9:9)";
  const payload = buildClientErrorPayload('boundary', error, { path: '/admin/players?q=Ana#top', build: 'Ab12Cd', componentStack: '\n    at Row\n    at Lot' });
  assert.ok(payload);
  assert.equal(payload.message, "TypeError: Cannot read properties of undefined (reading 'name')");
  assert.deepEqual(payload.stack, [
    'at Row (https://bcms.ro/assets/Lot-abc.js:1:200)',
    'at renderWithHooks (https://bcms.ro/assets/index-x.js:9:9)',
    'at Row',
    'at Lot',
  ]);
  assert.equal(payload.path, '/admin/players');
  assert.equal(payload.build, 'Ab12Cd');
});

test('window.onerror details: script URL without query, line and column', () => {
  const payload = buildClientErrorPayload('error', 'Uncaught ReferenceError: foo is not defined', {
    path: '/coach', source: 'https://bcms.ro/assets/index-x.js?v=2', line: 3, col: 14,
  });
  assert.equal(payload?.source, 'https://bcms.ro/assets/index-x.js');
  assert.equal(payload?.line, 3);
  assert.equal(payload?.col, 14);
});

test('no connection, API errors, stale chunks and cross-origin noise are not reported', () => {
  assert.equal(isIgnoredClientError(new TypeError('Failed to fetch')), true);
  assert.equal(isIgnoredClientError(Object.assign(new Error('Jucătorul Ana Pop nu a fost găsit.'), { status: 404 })), true);
  assert.equal(isIgnoredClientError(new TypeError('Failed to fetch dynamically imported module: https://bcms.ro/assets/x.js')), true);
  assert.equal(isIgnoredClientError('Script error.'), true);
  assert.equal(isIgnoredClientError(new Error('')), true);
  assert.equal(isIgnoredClientError(new RangeError('Invalid time value')), false);
  assert.equal(buildClientErrorPayload('rejection', new TypeError('Load failed'), { path: '/' }), null);
});

test('each distinct error once per page, ten at most', () => {
  const gate = createReportGate(10);
  const make = (message: string) => buildClientErrorPayload('error', new Error(message), { path: '/' })!;
  assert.equal(gate(make('a')), true);
  assert.equal(gate(make('a')), false);
  for (let i = 0; i < 9; i += 1) assert.equal(gate(make(`b${i}`)), true);
  assert.equal(gate(make('c')), false, 'the eleventh distinct error is dropped');
});

test('build id from the entry chunk name', () => {
  assert.equal(buildIdFromScripts(['https://bcms.ro/assets/vendor-1.js', 'https://bcms.ro/assets/index-DxY3_a9Q.js']), 'DxY3_a9Q');
  assert.equal(buildIdFromScripts(['/src/main.tsx']), undefined);
});
