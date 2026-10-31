/**
 * Critique 7: money and eligibility signals that could be misread — a payment
 * dialog without the debt, Enter reversing a payment, Lot reading „0 restanțe”
 * when its figures failed, an expired visa ticked into a match.
 */
import { test, expect, signIn, apiAs, seedIds } from '../support/fixtures';

const openPayment = async (page: import('@playwright/test').Page, name: string) => {
  await page.goto('/admin/finance');
  const row = page.getByText(name, { exact: true }).first()
    .locator('xpath=ancestor::*[.//*[normalize-space(text())="Încasează"]][1]');
  await row.getByText('Încasează', { exact: true }).click();
  return page.getByRole('dialog', { name: /Încasare/ });
};

test('the payment dialog states the debt and labels every field', async ({ page }) => {
  await signIn(page, 'admin');
  const dialog = await openPayment(page, 'Radu Stan');
  await expect(dialog).toContainText(/de plătit \d/);
  for (const label of ['Suma (RON)', 'Data plății', 'Metoda', 'Notă (opțional)']) {
    await expect(dialog.getByText(label, { exact: true })).toBeVisible();
  }
  await expect(dialog.getByLabel('Suma încasată')).toHaveAttribute('inputmode', 'decimal');
  await dialog.getByLabel('Suma încasată').fill('0');
  await expect(dialog.getByText('Introdu o sumă mai mare ca 0.')).toBeVisible();
  // A typed amount isn't dropped on Esc without asking.
  await page.keyboard.press('Escape');
  const discard = page.getByRole('alertdialog', { name: 'Renunți la încasare?' });
  await expect(discard).toBeVisible();
  await discard.getByRole('button', { name: 'Renunță la încasare' }).click();
  await expect(dialog).toHaveCount(0);
});

test('critique 8: the typed amount is the only input and each fee shows what it gets', async ({ page }) => {
  await signIn(page, 'admin');
  const dialog = await openPayment(page, 'Radu Stan');
  // No ticks to rewrite the amount any more.
  await expect(dialog.getByRole('checkbox')).toHaveCount(0);
  const amount = dialog.getByLabel('Suma încasată');
  await amount.fill('abc');
  await expect(dialog).toContainText('Scrie suma în cifre');
  await amount.fill('1');
  await expect(dialog).toContainText(/Parțial · rămân/);
  await expect(amount).toHaveValue('1');
  await expect(dialog.getByRole('button', { name: /Înregistrează 1,00 RON/ })).toBeVisible();
  await dialog.getByRole('button', { name: 'Renunță' }).click();
});

test('Enter in the storno reason does not reverse the payment', async ({ page }) => {
  await signIn(page, 'admin');
  let reversed = false;
  await page.route('**/api/finance/**/reverse', (route) => { reversed = true; return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }); });
  await page.goto('/admin/finance');
  await page.waitForLoadState('networkidle');
  const storno = page.getByRole('button', { name: /^Stornează plata/ }).first();
  test.skip(!(await storno.count()), 'no desk payment to reverse in this seed');
  await storno.click();
  const dialog = page.getByRole('alertdialog', { name: /^Stornezi plata/ });
  await dialog.getByRole('textbox').fill('sumă greșită');
  await page.keyboard.press('Enter');
  await expect(dialog).toBeVisible();
  expect(reversed).toBe(false);
  await page.keyboard.press('Escape');
});

test('Lot says its figures failed instead of „0 cu restanțe”', async ({ page, consoleErrors }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await signIn(page, 'admin');
  await page.route('**/api/players/roster/summary**', (route) => route.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"x"}' }));
  await page.goto('/admin/roster');
  await expect(page.getByText('Cifrele lotului nu s-au încărcat')).toBeVisible();
  const tile = page.getByText('Fără restanțe', { exact: true }).locator('xpath=..');
  await expect(tile).toContainText('—');
  await expect(tile).not.toContainText('%');
  // The failed summary request is the scenario itself.
  consoleErrors.splice(0, consoleErrors.length, ...consoleErrors.filter((e) => !/roster summary|status of 500|Failed to load resource/i.test(e)));
});

test('an expired visa is not ticked into the match roster', async ({ page }) => {
  const { teams, players } = seedIds();
  const admin = await apiAs('admin');
  const radu = await (await admin.get(`players/${players.radu}`)).json();
  test.skip(!radu.medicalCheckExpiry || new Date(radu.medicalCheckExpiry) > new Date(), 'Radu has no expired visa in this seed');
  // A match of its own: other specs set up the seeded ones.
  const start = new Date(Date.now() + 3_600_000).toISOString();
  const created = await admin.post('events', { data: { title: 'U12 vs Viză E2E', type: 'match', teamId: teams.u12, startTime: start, endTime: start } });
  expect(created.ok()).toBe(true);
  const { id } = await created.json();
  await signIn(page, 'admin');
  await page.goto(`/admin/stats/${id}`);
  const box = page.getByRole('checkbox', { name: /Radu Stan: nu poate juca, viză expirată/ });
  await expect(box).toHaveAttribute('aria-checked', 'false');
  await expect(page.getByText('Nu poate juca: viză expirată')).toBeVisible();
});
