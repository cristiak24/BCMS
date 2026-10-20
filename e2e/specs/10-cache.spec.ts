/**
 * Acasă remembers what it showed (hooks/useCachedState, utils/screenCache):
 * on the next visit the figures paint at once from the copy, while the API
 * is still answering — a cold Render or a weak signal no longer means a
 * screen of skeletons. Never across accounts: signing out clears it.
 */
import type { Page } from '@playwright/test';
import { test, expect, signIn } from '../support/fixtures';

/** Every API answer except the session takes 8 s, like a sleeping Render. */
async function slowApi(page: Page) {
  await page.route('**/api/**', async (route) => {
    if (route.request().url().includes('/auth/me')) return route.continue();
    await new Promise((resolve) => setTimeout(resolve, 8_000));
    return route.continue().catch(() => undefined);
  });
}

test('the admin home paints last visit\'s figures while a slow API answers', async ({ page }) => {
  await signIn(page, 'admin');
  await page.goto('/admin/dashboard');
  const nextMatch = page.getByText('Amical U12 (scorer)').filter({ visible: true }).first();
  await expect(nextMatch).toBeVisible();

  // Everything loaded (and remembered) before the next visit.
  await page.waitForLoadState('networkidle');
  await slowApi(page);
  await page.reload();
  await expect(nextMatch, 'shown from the copy, long before the 8 s API').toBeVisible({ timeout: 3_000 });
  await page.unrouteAll({ behavior: 'ignoreErrors' });
});

test('the coach home too', async ({ page }) => {
  await signIn(page, 'coach');
  await page.goto('/coach/dashboard');
  const session = page.getByText('Amical U12 (scorer)').filter({ visible: true }).first();
  await expect(session).toBeVisible();
  // Everything loaded (and remembered) before the next visit.
  await page.waitForLoadState('networkidle');
  await slowApi(page);
  await page.reload();
  await expect(session).toBeVisible({ timeout: 3_000 });
  await page.unrouteAll({ behavior: 'ignoreErrors' });
});

test('a parent\'s home paints from the copy as well', async ({ page }) => {
  await signIn(page, 'parent');
  await page.goto('/myclub');
  const anything = page.getByText(/Antrenament U12|Amical U12/).filter({ visible: true }).first();
  await expect(anything).toBeVisible();
  // Everything loaded (and remembered) before the next visit.
  await page.waitForLoadState('networkidle');
  await slowApi(page);
  await page.reload();
  await expect(anything).toBeVisible({ timeout: 3_000 });
  await page.unrouteAll({ behavior: 'ignoreErrors' });
});
