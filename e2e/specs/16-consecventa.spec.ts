/**
 * Critique-7/8 leftovers: row menus open next to their ⋯ on a desktop and move
 * with the arrow keys; Echipă rows match Lot; Setări edits every fee the same way.
 */
import { test, expect, signIn, seedIds } from '../support/fixtures';

test('a row menu opens next to its ⋯ and moves with the arrow keys', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await signIn(page, 'admin');
  await page.goto('/admin/roster');
  const trigger = page.getByRole('button', { name: /^Acțiuni pentru / }).first();
  await trigger.click();
  const menu = page.getByRole('menu').first();
  await expect(menu).toBeVisible();
  const [t, m] = [await trigger.boundingBox(), await menu.boundingBox()];
  expect(t && m, 'both measured').toBeTruthy();
  // Right edges aligned and the menu within ~420px of the button vertically.
  expect(Math.abs((t!.x + t!.width) - (m!.x + m!.width))).toBeLessThan(40);
  expect(Math.abs(m!.y - (t!.y + t!.height))).toBeLessThan(420);

  const items = menu.getByRole('menuitem');
  await items.first().focus();
  await page.keyboard.press('ArrowDown');
  await expect(items.nth(1)).toBeFocused();
  await page.keyboard.press('End');
  await expect(items.last()).toBeFocused();
  await page.keyboard.press('Home');
  await expect(items.first()).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(menu).toHaveCount(0);
});

test('Echipă: Lot\'s column order and one ⋯ per row', async ({ page }) => {
  const { teams } = seedIds();
  await page.setViewportSize({ width: 1280, height: 900 });
  await signIn(page, 'admin');
  await page.goto(`/admin/team/${teams.u12}`);
  // The headings left to right, by position (their text is in CSS capitals).
  const headerRow = page.getByText('Jucător', { exact: true }).first().locator('xpath=..');
  const x = async (label: string) => (await headerRow.getByText(label, { exact: true }).boundingBox())!.x;
  expect(await x('Viză medicală')).toBeLessThan(await x('Prezență'));
  expect(await x('Prezență')).toBeLessThan(await x('Plată'));
  await expect(page.getByRole('button', { name: 'Scoate din echipă' })).toHaveCount(0);
  await page.getByRole('button', { name: /^Acțiuni pentru / }).first().click();
  await expect(page.getByRole('menuitem', { name: /Scoate din echipă/ })).toBeVisible();
  await page.keyboard.press('Escape');
});

test('Setări: the other fees show first and open for editing with „Modifică”', async ({ page }) => {
  await signIn(page, 'admin');
  await page.goto('/admin/finance?tab=setari');
  await expect(page.getByLabel('Contribuție antrenament')).toHaveCount(0);
  await page.getByRole('button', { name: 'Modifică alte taxe și restanțe' }).click();
  await expect(page.getByLabel('Contribuție antrenament')).toBeVisible();
  await page.getByRole('button', { name: 'Renunță', exact: true }).click();
  await expect(page.getByLabel('Contribuție antrenament')).toHaveCount(0);
});

test('Echipă: „Raport plăți” and „Vize medicale” are named dialogs that close on Esc', async ({ page }) => {
  const { teams } = seedIds();
  await page.setViewportSize({ width: 1280, height: 900 });
  await signIn(page, 'admin');
  await page.goto(`/admin/team/${teams.u12}`);
  for (const [button, name] of [['Raport plăți', /^Raport plăți/], ['Vize medicale', /^Vize medicale/]] as const) {
    await page.getByRole('button', { name: button, exact: true }).click();
    const dialog = page.getByRole('dialog', { name });
    await expect(dialog).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
  }
});
