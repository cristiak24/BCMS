import { test } from 'node:test';
import { strict as assert } from 'node:assert';

import { handleAssetRequest } from './assetFallback';

const html = () => new Response('<!doctype html>', { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } });
const js = () => new Response('export {}', { status: 200, headers: { 'content-type': 'text/javascript' } });

test('a chunk of an old build is a real 404, not index.html with 200 (WP7-G2)', async () => {
  const res = await handleAssetRequest(new Request('https://bcms.ro/assets/index-OLD123.js'), { fetch: async () => html() });
  assert.equal(res.status, 404);
  assert.equal(res.headers.get('cache-control'), 'no-store');
});

test('existing assets and app routes pass through untouched', async () => {
  const asset = await handleAssetRequest(new Request('https://bcms.ro/assets/index-NEW456.js'), { fetch: async () => js() });
  assert.equal(asset.status, 200);
  assert.equal(await asset.text(), 'export {}');
  const route = await handleAssetRequest(new Request('https://bcms.ro/admin/compliance'), { fetch: async () => html() });
  assert.equal(route.status, 200, 'the SPA fallback still serves the app for routes');
});
