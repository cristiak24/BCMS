/**
 * Val 2: browser crashes reach the server log without a paid service
 * (services/errorReporter.ts → POST /api/client-errors → `[client-error]`).
 * Works signed out (a crash can come before login), sends the page path
 * without its query (tokens live there), and the same crash only once.
 */
import { test, expect, signIn } from '../support/fixtures';

test('an uncaught error is reported once, signed out, without the query string', async ({ page, consoleErrors }) => {
  const reports: Array<{ body: Record<string, unknown>; status: number; auth: string | undefined }> = [];
  page.on('response', async (response) => {
    if (!response.url().endsWith('/api/client-errors')) return;
    const request = response.request();
    reports.push({ body: request.postDataJSON(), status: response.status(), auth: request.headers().authorization });
  });

  await page.goto('/login?invite=abc123secret#x');
  await page.evaluate(() => {
    // The same crash twice (same place): reported once.
    const crash = () => { throw new RangeError('e2e crash before login'); };
    setTimeout(crash, 0);
    setTimeout(crash, 10);
  });
  await expect.poll(() => reports.length).toBe(1);
  await page.waitForTimeout(500);
  expect(reports).toHaveLength(1);
  expect(reports[0].status).toBe(204);
  expect(reports[0].auth).toBeUndefined();
  expect(reports[0].body).toMatchObject({ kind: 'error', message: 'RangeError: e2e crash before login', path: '/login' });
  expect(JSON.stringify(reports[0].body)).not.toContain('abc123secret');
  consoleErrors.splice(0, consoleErrors.length, ...consoleErrors.filter((e) => !e.includes('e2e crash')));
});

test('an unhandled rejection is reported with the Bearer when signed in', async ({ page, consoleErrors }) => {
  await signIn(page, 'admin');
  await page.goto('/admin/dashboard');
  await expect(page.getByText(/(Bună (dimineața|ziua|seara)|Noapte bună), Andrei/)).toBeVisible();
  const reported = page.waitForRequest((request) => request.url().endsWith('/api/client-errors'));
  await page.evaluate(() => { void Promise.reject(new TypeError('e2e rejection signed in')); });
  const request = await reported;
  expect(request.postDataJSON()).toMatchObject({ kind: 'rejection', message: 'TypeError: e2e rejection signed in', path: '/admin/dashboard' });
  expect(request.headers().authorization).toMatch(/^Bearer /);
  expect((await request.response())?.status()).toBe(204);
  consoleErrors.splice(0, consoleErrors.length, ...consoleErrors.filter((e) => !e.includes('e2e rejection')));
});
