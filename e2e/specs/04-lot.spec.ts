/**
 * Lot (audit R5): most children have no email. Editing one (shirt number)
 * must save and survive a reload — before WP4A the client sent `email: null`,
 * the API answered 400 and the header still showed the unsaved value.
 */
import { test, expect, signIn, apiAs, seedIds } from '../support/fixtures';

test('a player without an email can be edited and the change persists', async ({ page }) => {
  const { players } = seedIds();
  const admin = await apiAs('admin');
  const before = await (await admin.get(`players/${players.radu}`)).json();
  expect(before.email ?? null, 'Radu has no email').toBeNull();

  await signIn(page, 'admin');
  await page.goto(`/admin/player/${players.radu}`);
  const shirt = page.getByLabel('Număr tricou');
  await expect(shirt).toHaveValue(String(before.number));
  await shirt.fill('23');
  const save = page.getByRole('button', { name: /^Salvează/ }).first();
  await expect(save).toBeVisible();
  const saved = page.waitForResponse((r) => r.url().includes(`/players/${players.radu}`) && r.request().method() === 'PUT');
  await save.click();
  expect((await saved).status()).toBe(200);
  await expect(page.getByText('#23').first()).toBeVisible();

  await page.reload();
  await expect(page.getByLabel('Număr tricou')).toHaveValue('23');
  await expect(page.getByText('#23').first()).toBeVisible();
  const after = await (await admin.get(`players/${players.radu}`)).json();
  expect(after.number).toBe(23);
  expect(after.email ?? null).toBeNull();
});

test('„Elimină din club” names the selection, starts on „Renunță”, and a search clears it', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await signIn(page, 'admin');
  await page.goto('/admin/roster');
  const boxes = page.locator('main [role="checkbox"]');
  await boxes.nth(1).click();
  await boxes.nth(2).click();
  await expect(page.getByText('în selecție', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: /^Elimină din club/ }).click();
  const dialog = page.getByRole('alertdialog', { name: 'Elimini 2 jucători din club?' });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('Ies din toate echipele');
  await expect(dialog.getByRole('button', { name: 'Renunță' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(page.getByText('în selecție', { exact: true })).toBeVisible();

  // A new search starts a new selection: no bulk action on rows the list no longer shows.
  await page.getByPlaceholder('Caută după nume, tricou, echipă sau plată...').first().fill('zzz');
  await expect(page.getByText('în selecție', { exact: true })).toHaveCount(0);
});
