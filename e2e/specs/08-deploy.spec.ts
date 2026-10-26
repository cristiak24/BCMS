/**
 * Deploy (audit runda 5, src/lazyRoute.ts): a phone keeps the old app open
 * after a deploy; the next screen it opens asks for a chunk name that no
 * longer exists, and Cloudflare (like support/client/serve.ts) answers a
 * real 404 (the /assets/* Worker, WP7-G2). The app must notice, reload once
 * onto the new build, and show the screen.
 */
import type { Page } from '@playwright/test';
import { test, expect, signIn } from '../support/fixtures';
import { E2E } from '../support/env';

test('a missing chunk is a real 404, while app paths keep the SPA fallback (as in production)', async ({ request }) => {
  const asset = await request.get(`${E2E.webUrl}/assets/does-not-exist-123.js`);
  expect(asset.status()).toBe(404);
  expect(asset.headers()['content-type']).not.toContain('text/html');
  const route = await request.get(`${E2E.webUrl}/admin/does-not-exist`);
  expect(route.status()).toBe(200);
  expect(route.headers()['content-type']).toContain('text/html');
});

/**
 * Simulates the deploy and opens a screen the "old" tab has not loaded yet.
 * Returns once the app reloaded and the screen shows.
 */
async function openScreenAfterDeploy(page: Page) {
  await signIn(page, 'admin');
  await page.goto('/admin/dashboard');
  await expect(page.getByText(/(Bună (dimineața|ziua|seara)|Noapte bună), Andrei/)).toBeVisible();
  await page.waitForLoadState('networkidle');

  // "Deploy": every chunk this tab has not loaded yet now has an old name,
  // which the server answers with a 404.
  const loaded = new Set(await page.evaluate(() => performance.getEntriesByType('resource').map((e) => e.name)));
  let stale = true;
  const staleRequests: string[] = [];
  await page.route('**/assets/*.js', async (route) => {
    const url = route.request().url();
    if (!stale || loaded.has(url)) return route.continue();
    staleRequests.push(url);
    return route.continue({ url: url.replace(/\.js$/, '.old-build.js') });
  });
  // The reload lands on the new build: stop serving old names from then on.
  page.on('request', (request) => {
    if (request.isNavigationRequest() && request.frame() === page.mainFrame()) stale = false;
  });

  const reloaded = page.waitForEvent('load');
  await page.getByRole('link', { name: 'Conformitate', exact: true }).first().click();
  await reloaded;

  expect(staleRequests.length, 'the screen asked for a chunk the "old" app no longer had').toBeGreaterThan(0);
  await expect(page).toHaveURL(/\/admin\/compliance$/);
  await expect(page.getByText('Vizele medicale ale jucătorilor din club.')).toBeVisible();
  expect(await page.evaluate(() => window.sessionStorage.getItem('bcms.chunk-reload-at'))).not.toBeNull();
}

/** The browser logs the HTML-instead-of-JS module failure; that is the scenario itself. */
const MODULE_LOAD_NOISE = /MIME type|dynamically imported module|Failed to load module script|Failed to load resource.*404/i;

/**
 * Was bug E2E-1: src/lazyRoute.ts cancels `vite:preloadError` when it starts
 * the reload. Vite then either resolves the failed import with `undefined`
 * or reports the route import a second time inside the reload cooldown —
 * both flashed the ErrorBoundary screen ("Ceva nu a funcționat") until the
 * reload landed, on some runs only (which chunk fails first). Now load()
 * holds an undefined module pending and utils/staleChunk.ts treats every
 * report after the first as the same reload (unit-tested there, since the
 * order can't be forced here). Checked on every DOM change: the error screen
 * never appears, and nothing but the expected module-load noise is logged.
 */
test('a stale chunk reloads the app once, without ever flashing the error screen', async ({ page, consoleErrors }) => {
  const flashes: string[] = [];
  await page.exposeFunction('__e2eErrorScreen', (text: string) => { flashes.push(text); });
  await page.addInitScript(() => {
    const report = (window as unknown as { __e2eErrorScreen: (text: string) => void }).__e2eErrorScreen;
    new MutationObserver(() => {
      if (document.body?.innerText.includes('Ceva nu a funcționat')) report(location.pathname);
    }).observe(document, { childList: true, subtree: true, characterData: true });
  });

  await openScreenAfterDeploy(page);
  expect(flashes, 'the error screen showed during the stale-chunk reload').toEqual([]);
  consoleErrors.splice(0, consoleErrors.length, ...consoleErrors.filter((e) => !MODULE_LOAD_NOISE.test(e)));
});
