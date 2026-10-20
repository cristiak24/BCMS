/**
 * The API sleeps on Render's free plan and is briefly away during a deploy.
 * A profile request in that window failed with the browser's raw "Failed to
 * fetch" right after a successful sign-in (user report, 2026-10-20). Reads
 * now wait for the server and retry (utils/networkRetry.ts).
 */
import { test, expect, signIn } from '../support/fixtures';

test('the profile request survives the server being away for a moment', async ({ page, consoleErrors }) => {
  let failures = 0;
  await page.route('**/api/auth/me', (route) => {
    if (failures < 2) {
      failures += 1;
      return route.abort('failed');
    }
    return route.continue();
  });

  await signIn(page, 'admin');
  await page.goto('/admin/dashboard');
  await expect(page.getByText(/(Bună (dimineața|ziua|seara)|Noapte bună), Andrei/)).toBeVisible({ timeout: 20_000 });
  expect(failures).toBe(2);
  await expect(page.getByText(/Failed to fetch/i)).toHaveCount(0);
  // The two dropped requests are the scenario itself.
  consoleErrors.splice(0, consoleErrors.length, ...consoleErrors.filter((e) => !/ERR_FAILED|Failed to fetch|auth\/me failed|Failed to load resource/i.test(e)));
});
