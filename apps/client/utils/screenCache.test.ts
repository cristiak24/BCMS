import { test, beforeEach } from 'node:test';
import { strict as assert } from 'node:assert';

import { clearScreenCache, readScreenCache, resetScreenCacheMemory, SCREEN_CACHE_MAX_AGE_MS, writeScreenCache } from './screenCache';

const backing = new Map<string, string>();
(globalThis as unknown as { localStorage: unknown }).localStorage = {
  getItem: (key: string) => backing.get(key) ?? null,
  setItem: (key: string, value: string) => { backing.set(key, value); },
  removeItem: (key: string) => { backing.delete(key); },
};

beforeEach(() => {
  backing.clear();
  resetScreenCacheMemory();
});

test('what a screen saw last time comes back, also after a reload', () => {
  writeScreenCache('user_a:-', 'home.summary', { players: 11 });
  assert.deepEqual(readScreenCache('user_a:-', 'home.summary'), { players: 11 });
  resetScreenCacheMemory(); // a fresh page load
  assert.deepEqual(readScreenCache('user_a:-', 'home.summary'), { players: 11 });
});

test('never across accounts or children', () => {
  writeScreenCache('user_parent:12', 'home.events', ['Matei']);
  assert.equal(readScreenCache('user_parent:14', 'home.events'), undefined, 'the other child');
  assert.equal(readScreenCache('user_b:-', 'home.events'), undefined, 'another account');
  assert.equal(readScreenCache(null, 'home.events'), undefined, 'no session');
});

test('sign-out leaves nothing behind', () => {
  writeScreenCache('user_a:-', 'home.summary', { players: 11 });
  clearScreenCache();
  assert.equal(readScreenCache('user_a:-', 'home.summary'), undefined);
  assert.equal(backing.size, 0);
});

test('an old copy is not shown', () => {
  writeScreenCache('user_a:-', 'home.summary', 1, 0);
  assert.equal(readScreenCache('user_a:-', 'home.summary', SCREEN_CACHE_MAX_AGE_MS + 1), undefined);
});
