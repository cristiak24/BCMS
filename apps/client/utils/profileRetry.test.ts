import { test } from 'node:test';
import { strict as assert } from 'node:assert';

import { loadProfileWithRetry, ProfileMissingError, PROFILE_MISSING_MESSAGE } from './profileRetry';

const notFound = Object.assign(new Error('User profile not found'), { status: 404 });
const isMissing = (error: unknown) => (error as { status?: number })?.status === 404;
const noSleep = { sleep: async () => undefined };

test('an account with no profile gives up after two tries with a clear Romanian message', async () => {
  let calls = 0;
  await assert.rejects(
    loadProfileWithRetry(async () => { calls += 1; throw notFound; }, isMissing, noSleep),
    (error: unknown) => error instanceof ProfileMissingError && (error as Error).message === PROFILE_MISSING_MESSAGE,
  );
  assert.equal(calls, 2);
});

test('a profile that appears on the second try is returned', async () => {
  let calls = 0;
  const profile = await loadProfileWithRetry(async () => { calls += 1; if (calls === 1) throw notFound; return { id: 7 }; }, isMissing, noSleep);
  assert.deepEqual(profile, { id: 7 });
});

test('any other error is not retried here', async () => {
  let calls = 0;
  await assert.rejects(loadProfileWithRetry(async () => { calls += 1; throw new Error('Network down'); }, isMissing, noSleep), /Network down/);
  assert.equal(calls, 1);
});
