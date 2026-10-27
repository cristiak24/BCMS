/**
 * Critique 6 (P3): Acces showed „Coduri” empty while team codes were live (they
 * sat folded under Cereri); Situație had four controls in the Restanțe header.
 */
import { test, expect, signIn } from '../support/fixtures';

test('Acces › Coduri lists the team codes next to the group codes', async ({ page }) => {
  await signIn(page, 'admin');
  await page.goto('/admin/manage-access');
  await page.getByRole('tab', { name: /Coduri/ }).click();
  await expect(page.getByText('Codurile echipelor', { exact: true })).toBeVisible();
  await expect(page.getByText(/^Coduri de grup/)).toBeVisible();
  await page.getByRole('tab', { name: /Cereri/ }).click();
  await expect(page.getByText('Codurile echipelor', { exact: true })).toHaveCount(0);
});

test('Situație: one „Exportă” menu offers balances and a month of payments', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await signIn(page, 'admin');
  await page.goto('/admin/finance');
  await page.getByRole('button', { name: 'Exportă', exact: true }).click();
  const sheet = page.getByRole('dialog', { name: 'Exportă (CSV)' });
  await expect(sheet.getByRole('menuitem', { name: /Solduri/ })).toBeVisible();
  await sheet.getByRole('menuitem', { name: /Plăți pe o lună/ }).click();
  const months = page.getByRole('dialog', { name: 'Plățile din ce lună?' });
  await expect(months.getByRole('menuitem')).not.toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(months).toHaveCount(0);
});
