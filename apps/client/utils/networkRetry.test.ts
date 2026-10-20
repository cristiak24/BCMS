import { test } from 'node:test';
import { strict as assert } from 'node:assert';

import { isNetworkError, retryOnNetworkError } from './networkRetry';

const noSleep = { sleep: async () => undefined };

test('the raw "no answer" errors of every browser are network errors; HTTP errors are not', () => {
  assert.equal(isNetworkError(new TypeError('Failed to fetch')), true);
  assert.equal(isNetworkError(new TypeError('Load failed')), true); // Safari / iPhone
  assert.equal(isNetworkError(new TypeError('NetworkError when attempting to fetch resource.')), true);
  assert.equal(isNetworkError(Object.assign(new Error('x'), { name: 'AbortError' })), true);
  assert.equal(isNetworkError(Object.assign(new Error('Unauthorized'), { status: 401 })), false);
  assert.equal(isNetworkError(new TypeError('Cannot read properties of undefined')), false);
});

test('a sleeping server: the request is retried until it answers', async () => {
  let calls = 0;
  let wakes = 0;
  const out = await retryOnNetworkError(async () => {
    calls += 1;
    if (calls < 3) throw new TypeError('Failed to fetch');
    return 'profil';
  }, { ...noSleep, beforeRetry: async () => { wakes += 1; } });
  assert.equal(out, 'profil');
  assert.equal(calls, 3);
  assert.equal(wakes, 2);
});

test('gives up after the last delay, and never retries an HTTP error', async () => {
  let calls = 0;
  await assert.rejects(retryOnNetworkError(async () => { calls += 1; throw new TypeError('Load failed'); }, { ...noSleep, delaysMs: [1, 1] }), /Load failed/);
  assert.equal(calls, 3);

  calls = 0;
  await assert.rejects(retryOnNetworkError(async () => { calls += 1; throw Object.assign(new Error('Forbidden'), { status: 403 }); }, noSleep), /Forbidden/);
  assert.equal(calls, 1);
});
