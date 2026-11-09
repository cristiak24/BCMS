/**
 * Admin audit 2026-11-08: each role sees only its own admin pages, Lot answers
 * in toasts instead of the browser's alert box, one „Adaugă jucător” per width,
 * and arrow keys move between tabs.
 */
import { test, expect, signIn, seedIds } from '../support/fixtures';

test('the accountant is sent to Finanțe from admin-only pages', async ({ page }) => {
  const { players } = seedIds();
  await signIn(page, 'accountant');
  for (const path of ['/admin/roster', `/admin/player/${players.radu}`, '/admin/compliance', '/admin/l12', '/admin/dashboard', '/admin']) {
    await page.goto(path);
    await expect(page, path).toHaveURL(/\/admin\/finance$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Finanțele clubului' })).toBeVisible();
  }
  // Their own pages still open.
  await page.goto('/admin/documents');
  await expect(page).toHaveURL(/\/admin\/documents$/);
  await page.goto('/admin/contacts');
  await expect(page).toHaveURL(/\/admin\/contacts$/);
});

test('Lot reports sent reminders in a toast, not a browser alert', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await signIn(page, 'admin');
  const alerts: string[] = [];
  page.on('dialog', (d) => { alerts.push(d.message()); void d.dismiss(); });
  // Answered here: real reminders would notify the seeded families.
  await page.route('**/api/players/payment-reminders', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ sent: 3, players: 2, recipients: [1, 2, 3], skipped: 0 }),
  }));
  await page.goto('/admin/roster');
  await page.getByRole('button', { name: /^Trimite mementouri/ }).first().click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Trimite mementouri' }).click();
  await expect(page.getByText(/^Mementouri trimise: 3 notificări pentru 2 jucători cu restanțe/)).toBeVisible();
  expect(alerts).toEqual([]);
});

test('Lot offers one „Adaugă jucător” at every width', async ({ page }) => {
  await signIn(page, 'admin');
  for (const width of [375, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/admin/roster');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Adaugă jucător' }), `${width}px`).toHaveCount(1);
  }
});

test('arrow keys move between tabs and select them', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await signIn(page, 'admin');
  await page.goto('/admin/finance');
  const summary = page.getByRole('tab', { name: 'Situație' });
  const online = page.getByRole('tab', { name: 'Plăți online' });
  const settings = page.getByRole('tab', { name: 'Setări' });
  await expect(summary).toHaveAttribute('aria-selected', 'true');

  await summary.focus();
  await page.keyboard.press('ArrowRight');
  await expect(online).toBeFocused();
  await expect(online).toHaveAttribute('aria-selected', 'true');

  await page.keyboard.press('End');
  await expect(settings).toBeFocused();
  await expect(settings).toHaveAttribute('aria-selected', 'true');

  // Past the last tab: back to the first.
  await page.keyboard.press('ArrowRight');
  await expect(summary).toBeFocused();
  await expect(summary).toHaveAttribute('aria-selected', 'true');
});
