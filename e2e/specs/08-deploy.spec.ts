/**
 * Deploy (audit runda 5, src/lazyRoute.ts): a phone keeps the old app open
 * after a deploy; the next screen it opens asks for a chunk name that no
 * longer exists, and Cloudflare (like support/client/serve.ts) answers with
 * index.html. The app must notice, reload once onto the new build, and show
 * the screen.
 */
import type { Page } from '@playwright/test';
import { test, expect, signIn } from '../support/fixtures';
import { E2E } from '../support/env';

test('a missing chunk is answered with index.html (SPA fallback, as in production)', async ({ request }) => {
  const response = await request.get(`${E2E.webUrl}/assets/does-not-exist-123.js`);
  expect(response.status()).toBe(200);
  expect(response.headers()['content-type']).toContain('text/html');
});

/**
 * Simulates the deploy and opens a screen the "old" tab has not loaded yet.
 * Returns once the app reloaded and the screen shows.
 */
async function openScreenAfterDeploy(page: Page) {
  await signIn(page, 'admin');
  await page.goto('/admin/dashboard');
  await expect(page.getByText(/Bună (dimineața|ziua|seara), Andrei/)).toBeVisible();
  await page.waitForLoadState('networkidle');

  // "Deploy": every chunk this tab has not loaded yet now has an old name,
  // which the server answers with index.html.
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
  await page.getByRole('button', { name: 'Conformitate' }).first().click();
  await reloaded;

  expect(staleRequests.length, 'the screen asked for a chunk the "old" app no longer had').toBeGreaterThan(0);
  await expect(page).toHaveURL(/\/admin\/compliance$/);
  await expect(page.getByText('Vizele medicale ale sportivilor din club.')).toBeVisible();
  expect(await page.evaluate(() => window.sessionStorage.getItem('bcms.chunk-reload-at'))).not.toBeNull();
}

/** The browser logs the HTML-instead-of-JS module failure; that is the scenario itself. */
const MODULE_LOAD_NOISE = /MIME type|dynamically imported module|Failed to load module script/i;
/** Bug E2E-1 (below): what the error screen logs before the reload. */
const E2E_1 = /reading 'default'/;

test('a stale chunk reloads the app once and the screen shows', async ({ page, consoleErrors }) => {
  await openScreenAfterDeploy(page);
  consoleErrors.splice(0, consoleErrors.length, ...consoleErrors.filter((e) => !MODULE_LOAD_NOISE.test(e) && !E2E_1.test(e)));
});

/**
 * Bug E2E-1 (found by this suite, not fixed — WP6B does not touch app code):
 * src/lazyRoute.ts cancels `vite:preloadError` (event.preventDefault()) when it
 * starts the reload. Vite's preload helper then swallows the error and the
 * dynamic import RESOLVES with `undefined`, so React.lazy throws
 * "Cannot read properties of undefined (reading 'default')" and the
 * ErrorBoundary screen flashes (and logs) until the reload replaces the page.
 * Depends on whether a dependency chunk or the route chunk fails first, so it
 * shows on some runs only. Fix idea: in the preloadError handler, reload
 * without preventDefault(), or make lazyRoute treat an undefined module as a
 * stale chunk.
 */
test.fixme('E2E-1: a stale chunk never flashes the error screen', async ({ page, consoleErrors }) => {
  await openScreenAfterDeploy(page);
  consoleErrors.splice(0, consoleErrors.length, ...consoleErrors.filter((e) => !MODULE_LOAD_NOISE.test(e)));
});
