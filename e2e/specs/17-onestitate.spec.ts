/**
 * Critique 9: what is coming up, what happened after an action, and the one
 * setting that changes every family's bill.
 */
import { test, expect, signIn } from '../support/fixtures';

test('Program lists the next 14 days whatever month is on screen', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await signIn(page, 'admin');
  await page.goto('/admin/schedule');
  const heading = page.getByRole('heading', { name: /^Următoarele 14 zile/ });
  // Wait for the count (the events load after the heading).
  await expect(heading).toHaveText(/ · \d/);
  const before = await heading.innerText();
  await page.getByRole('button', { name: 'Luna anterioară' }).click();
  await expect(page.getByRole('heading', { name: /^Următoarele 14 zile/ })).toHaveText(before);
});

test('a failed document approval says so in a toast, not a browser alert', async ({ page, consoleErrors }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await signIn(page, 'admin');
  const alerts: string[] = [];
  page.on('dialog', (d) => { alerts.push(d.message()); void d.dismiss(); });
  await page.route('**/api/finance/documents/*/status', (route) => route.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"internal"}' }));
  await page.goto('/admin/finance');
  await page.waitForLoadState('networkidle');
  const approve = page.getByRole('button', { name: /^Aprobă / }).first();
  test.skip(!(await approve.count()), 'no document waiting in this seed');
  await approve.click();
  await expect(page.getByText(/Statusul documentului nu s-a schimbat/)).toBeVisible();
  expect(alerts).toEqual([]);
  // The failed request is the scenario itself.
  consoleErrors.splice(0, consoleErrors.length, ...consoleErrors.filter((e) => !/status of 500|Failed to update document status/i.test(e)));
});

test('changing the monthly fee says what it changes before saving', async ({ page }) => {
  await signIn(page, 'admin');
  let saved = false;
  await page.route('**/api/finance/settings', (route) => { if (route.request().method() !== 'GET') saved = true; return route.continue(); });
  await page.goto('/admin/finance?tab=setari');
  await page.getByRole('button', { name: 'Modifică cotizație' }).click();
  const field = page.getByRole('textbox', { name: 'Cotizație' });
  await field.fill('150,5');
  await page.getByRole('button', { name: 'Salvează', exact: true }).first().click();
  const confirm = page.getByRole('alertdialog', { name: 'Schimbi cotizația la 150.5 RON?' });
  await expect(confirm).toContainText('fiecărei luni încă neplătite');
  await expect(confirm.getByRole('button', { name: 'Renunță' })).toBeFocused();
  await page.keyboard.press('Escape');
  expect(saved).toBe(false);
});

test('the visa date starts empty instead of a year from today', async ({ page }) => {
  await signIn(page, 'admin');
  await page.goto('/admin/compliance');
  await page.getByRole('button', { name: /^(Actualizează|Viză)/ }).first().click();
  const date = page.getByLabel('Valabilă până la');
  await expect(date).toHaveValue('');
  await page.getByRole('button', { name: '+1 an' }).click();
  await expect(date).not.toHaveValue('');
  await page.keyboard.press('Escape');
});
