/**
 * Critique 6 (P2): keyboard. A player's four attendance marks were four Tab
 * stops with no arrow keys; the day sheet in Program ignored Esc.
 */
import { test, expect, signIn, apiAs, seedIds } from '../support/fixtures';

const TITLE = `Antrenament tastatură E2E ${Date.now() % 100000}`;
let eventId: number;

test.beforeAll(async () => {
  const { teams } = seedIds();
  const admin = await apiAs('admin');
  const start = new Date(Date.now() - 2 * 3_600_000);
  const response = await admin.post('events', {
    data: { title: TITLE, type: 'training', teamId: teams.u12, location: 'Sala Sporturilor', startTime: start.toISOString(), endTime: new Date(start.getTime() + 3_600_000).toISOString() },
  });
  expect(response.ok()).toBe(true);
  eventId = (await response.json()).id;
});

test('attendance marks: one Tab stop, arrows move, Space marks', async ({ page }) => {
  await signIn(page, 'admin');
  await page.goto(`/admin/attendance/${eventId}`);
  const present = page.getByRole('radio', { name: 'Prezent: Radu Stan' });
  const late = page.getByRole('radio', { name: 'Întârziat: Radu Stan' });
  const absent = page.getByRole('radio', { name: 'Absent: Radu Stan' });
  const medical = page.getByRole('radio', { name: 'Motivat: Radu Stan' });
  await expect(present).toHaveAttribute('tabindex', '0');
  await expect(late).toHaveAttribute('tabindex', '-1');

  await present.focus();
  await page.keyboard.press('ArrowRight');
  await expect(late).toBeFocused();
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowLeft');
  await expect(medical).toBeFocused();
  await expect(medical).toHaveAttribute('aria-checked', 'false'); // arrows don't record a mark

  await page.keyboard.press('ArrowLeft');
  const saved = page.waitForResponse((r) => r.url().includes(`/events/${eventId}/attendance`) && r.request().method() === 'POST');
  await page.keyboard.press('Space');
  expect((await saved).status()).toBe(200);
  await expect(absent).toHaveAttribute('aria-checked', 'true');
  await expect(absent).toHaveAttribute('tabindex', '0');
  await expect(present).toHaveAttribute('tabindex', '-1');
});

test('the day sheet in Program closes on Esc', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await signIn(page, 'admin');
  await page.goto('/admin/schedule');
  const today = new Date().toLocaleDateString('ro-RO', { day: 'numeric', month: 'long' });
  await page.locator(`[aria-label^="${today}"]`).first().click();
  const sheet = page.getByRole('dialog', { name: /^Programul zilei/ });
  await expect(sheet).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(sheet).toHaveCount(0);
});
