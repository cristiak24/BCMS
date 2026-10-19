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
