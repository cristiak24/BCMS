import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cacheSize, clearCache, getOrCompute, sweepExpired } from './microCache';

test('expired entries are swept instead of living until the key is written again', async () => {
    clearCache();
    await getOrCompute('short', 10, async () => 'a');
    await getOrCompute('long', 60_000, async () => 'b');
    assert.equal(cacheSize(), 2);

    assert.equal(sweepExpired(Date.now() + 1_000), 1);
    assert.equal(cacheSize(), 1);
    // The live entry is still served from the cache.
    assert.equal(await getOrCompute('long', 60_000, async () => 'recomputed'), 'b');
    clearCache();
});
