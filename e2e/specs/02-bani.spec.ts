/**
 * Bani (audit P0-2, P1-8): a partial cash payment (50 RON against the 170 RON
 * of overdue fees the dialog preselects) only pays 50 RON — the player stays
 * in arrears with the rest — and "restanță" is the same number on the
 * Dashboard, the Lot and Finanțe. Before WP2 the 50 RON paid the whole fee
 * and the screens disagreed (8 / 5 / 1).
 * Amounts depend on today's date (fees fall due on the 25th), so the
 * expectations are derived from the API before the payment.
 */
import type { Page } from '@playwright/test';
import { test, expect, signIn, apiAs, seedIds } from '../support/fixtures';

type Balance = { playerId: number; playerName: string; outstanding: number; overdue: number; state: string };

async function balances(): Promise<Balance[]> {
  const api = await apiAs('admin');
  const body = await (await api.get('finance/admin/balances')).json() as { players: Balance[] };
  return body.players;
}

const ron = (amount: number) => `${new Intl.NumberFormat('ro-RO', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount)} RON`;

/** The number `pattern` captures on `page`, once the screen's data has loaded. */
async function expectFigure(page: Page, pattern: RegExp, expected: number, label: string) {
  await expect.poll(async () => {
    const match = pattern.exec(await page.locator('body').innerText());
    return match ? Number(match[1]) : null;
  }, { message: label }).toBe(expected);
}

test('a partial payment pays only its amount and the player stays in arrears', async ({ page }) => {
  const { players } = seedIds();
  const before = (await balances()).find((b) => b.playerId === players.luca)!;
  expect(before.overdue, 'Luca starts with overdue fees').toBeGreaterThanOrEqual(170);

  await signIn(page, 'admin');
  await page.goto('/admin/finance');
  const row = page.getByText('Luca Marin', { exact: true }).first()
    .locator('xpath=ancestor::*[.//*[normalize-space(text())="Încasează"]][1]');
  await row.getByText('Încasează', { exact: true }).click();

  const dialog = page.locator('.rn-modal').last();
  await expect(dialog).toContainText('Încasare · Luca Marin');
  // Everything overdue is preselected (one month, 170 RON, until the next
  // month's due day passes; two after), so the total follows the calendar.
  await expect(dialog.getByLabel('Suma încasată')).toHaveValue(String(before.overdue));
  await dialog.getByLabel('Suma încasată').fill('50');
  // The preview splits 50 RON onto the oldest fee only, partially.
  await expect(dialog).toContainText(/parțial/i);
  await dialog.getByText('Înregistrează plata', { exact: true }).click();
  await expect(dialog).toBeHidden();

  const after = (await balances()).find((b) => b.playerId === players.luca)!;
  expect(after.outstanding).toBe(before.outstanding - 50);
  expect(after.overdue).toBe(before.overdue - 50);
  expect(after.state).toBe('overdue');

  await page.reload();
  const lucaRow = page.getByText('Luca Marin', { exact: true }).first()
    .locator('xpath=ancestor::*[.//*[normalize-space(text())="Încasează"]][1]');
  // The row leads with what is past due; the total owed sits under it.
  await expect(lucaRow).toContainText(`${ron(after.overdue)}restant din ${ron(after.outstanding)}`);
});

test('"restanță" is the same number on Dashboard, Lot and Finanțe', async ({ page }) => {
  const expected = (await balances()).filter((b) => b.overdue > 0).length;
  expect(expected).toBeGreaterThan(0);

  await signIn(page, 'admin');
  await page.goto('/admin/dashboard');
  await expectFigure(page, /Cu restanțe\s*\n\s*(\d+)/i, expected, 'Dashboard: CU RESTANȚE');

  await page.goto('/admin/roster');
  await expectFigure(page, /(\d+)\s*\n\s*Cu restanțe/i, expected, 'Lot: Cu restanțe');

  await page.goto('/admin/finance');
  await expectFigure(page, /Restanțe\s*\n\s*(\d+) jucăto?r/i, expected, 'Finanțe: Restanțe · N jucători');
  await expectFigure(page, /Cu restanțe\s*\n\s*(\d+)/i, expected, 'Finanțe: Cu restanțe');
});
