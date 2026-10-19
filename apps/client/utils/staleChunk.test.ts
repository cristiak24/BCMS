import { test } from 'node:test';
import { strict as assert } from 'node:assert';

import { createStaleChunkGuard } from './staleChunk';

function env(lastReload = 0) {
  const state = { last: lastReload, reloads: 0, now: 100_000 };
  return {
    state,
    env: {
      now: () => state.now,
      read: () => state.last,
      write: (value: number) => { state.last = value; },
      reload: () => { state.reloads += 1; },
    },
  };
}

test('the first stale chunk reloads once; the second report in the same page is part of it (E2E-1)', () => {
  const { state, env: e } = env();
  const handle = createStaleChunkGuard(e);
  assert.equal(handle(), true, 'failed dependency preload: reload');
  assert.equal(handle(), true, 'the failed route import a moment later: still handled, no error screen');
  assert.equal(state.reloads, 1, 'and only one reload');
});

test('a page that just reloaded and still fails is a real breakage: not handled', () => {
  const { state, env: e } = env(95_000);
  const handle = createStaleChunkGuard(e);
  assert.equal(handle(), false);
  assert.equal(state.reloads, 0);
});

test('blocked storage still reloads rather than leaving a stuck screen', () => {
  const { state, env: e } = env();
  const handle = createStaleChunkGuard({ ...e, read: () => { throw new Error('blocked'); } });
  assert.equal(handle(), true);
  assert.equal(state.reloads, 1);
});
