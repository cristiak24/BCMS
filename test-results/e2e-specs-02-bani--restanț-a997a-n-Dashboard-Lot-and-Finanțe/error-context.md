# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: e2e/specs/02-bani.spec.ts >> "restanță" is the same number on Dashboard, Lot and Finanțe
- Location: e2e/specs/02-bani.spec.ts:69:5

# Error details

```
Error: apiRequestContext.get: connect ECONNREFUSED 127.0.0.1:4790
Call log:
  - → GET http://127.0.0.1:4790/api/finance/admin/balances
    - user-agent: Playwright/1.62.1 (arm64; macOS 27.0) node/24.11
    - accept: */*
    - accept-encoding: gzip,deflate,br
    - Authorization: Bearer test:admin@local.test

```

# Test source

```ts
  1   | /**
  2   |  * Bani (audit P0-2, P1-8): a partial cash payment (50 RON against the 170 RON
  3   |  * of overdue fees the dialog preselects) only pays 50 RON — the player stays
  4   |  * in arrears with the rest — and "restanță" is the same number on the
  5   |  * Dashboard, the Lot and Finanțe. Before WP2 the 50 RON paid the whole fee
  6   |  * and the screens disagreed (8 / 5 / 1).
  7   |  * Amounts depend on today's date (fees fall due on the 25th), so the
  8   |  * expectations are derived from the API before the payment.
  9   |  */
  10  | import type { Page } from '@playwright/test';
  11  | import { test, expect, signIn, apiAs, seedIds } from '../support/fixtures';
  12  | 
  13  | type Balance = { playerId: number; playerName: string; outstanding: number; overdue: number; state: string };
  14  | 
  15  | async function balances(): Promise<Balance[]> {
  16  |   const api = await apiAs('admin');
> 17  |   const body = await (await api.get('finance/admin/balances')).json() as { players: Balance[] };
      |                                 ^ Error: apiRequestContext.get: connect ECONNREFUSED 127.0.0.1:4790
  18  |   return body.players;
  19  | }
  20  | 
  21  | const ron = (amount: number) => `${new Intl.NumberFormat('ro-RO', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount)} RON`;
  22  | 
  23  | /** The number `pattern` captures on `page`, once the screen's data has loaded. */
  24  | async function expectFigure(page: Page, pattern: RegExp, expected: number, label: string) {
  25  |   await expect.poll(async () => {
  26  |     const match = pattern.exec(await page.locator('body').innerText());
  27  |     return match ? Number(match[1]) : null;
  28  |   }, { message: label }).toBe(expected);
  29  | }
  30  | 
  31  | test('a partial payment pays only its amount and the player stays in arrears', async ({ page }) => {
  32  |   const { players } = seedIds();
  33  |   const before = (await balances()).find((b) => b.playerId === players.luca)!;
  34  |   expect(before.overdue, 'Luca starts with overdue fees').toBeGreaterThanOrEqual(170);
  35  | 
  36  |   await signIn(page, 'admin');
  37  |   await page.goto('/admin/finance');
  38  |   const row = page.getByText('Luca Marin', { exact: true }).first()
  39  |     .locator('xpath=ancestor::*[.//*[normalize-space(text())="Încasează"]][1]');
  40  |   await row.getByText('Încasează', { exact: true }).click();
  41  | 
  42  |   const dialog = page.locator('.rn-modal').last();
  43  |   await expect(dialog).toContainText('Încasare · Luca Marin');
  44  |   // Everything overdue is preselected (one month, 170 RON, until the next
  45  |   // month's due day passes; two after), so the total follows the calendar.
  46  |   await expect(dialog.getByLabel('Suma încasată')).toHaveValue(String(before.overdue));
  47  |   await dialog.getByLabel('Suma încasată').fill('50');
  48  |   // The preview splits 50 RON onto the oldest fee only, partially.
  49  |   await expect(dialog).toContainText(/parțial/i);
  50  |   // The button carries the amount: the last look before it is booked.
  51  |   await dialog.getByText(/^Înregistrează 50,00\sRON$/).click();
  52  |   await expect(dialog).toBeHidden();
  53  |   // A confirmation names who paid how much, with a short undo.
  54  |   await expect(page.getByText(/^Încasat 50,00\sRON de la Luca Marin\.$/)).toBeVisible();
  55  |   await expect(page.getByRole('button', { name: 'Anulează' })).toBeVisible();
  56  | 
  57  |   const after = (await balances()).find((b) => b.playerId === players.luca)!;
  58  |   expect(after.outstanding).toBe(before.outstanding - 50);
  59  |   expect(after.overdue).toBe(before.overdue - 50);
  60  |   expect(after.state).toBe('overdue');
  61  | 
  62  |   await page.reload();
  63  |   const lucaRow = page.getByText('Luca Marin', { exact: true }).first()
  64  |     .locator('xpath=ancestor::*[.//*[normalize-space(text())="Încasează"]][1]');
  65  |   // The row leads with what is past due; the total owed sits under it.
  66  |   await expect(lucaRow).toContainText(`${ron(after.overdue)}restant din ${ron(after.outstanding)}`);
  67  | });
  68  | 
  69  | test('"restanță" is the same number on Dashboard, Lot and Finanțe', async ({ page }) => {
  70  |   const expected = (await balances()).filter((b) => b.overdue > 0).length;
  71  |   expect(expected).toBeGreaterThan(0);
  72  | 
  73  |   await signIn(page, 'admin');
  74  |   await page.goto('/admin/dashboard');
  75  |   await expectFigure(page, /Cu restanțe\s*\n\s*(\d+)/i, expected, 'Dashboard: CU RESTANȚE');
  76  | 
  77  |   await page.goto('/admin/roster');
  78  |   await expectFigure(page, /(\d+)\s*\n\s*Cu restanțe/i, expected, 'Lot: Cu restanțe');
  79  | 
  80  |   await page.goto('/admin/finance');
  81  |   await expectFigure(page, /Restanțe\s*\n\s*(\d+) jucăto?r/i, expected, 'Finanțe: Restanțe · N jucători');
  82  |   await expectFigure(page, /Cu restanțe\s*\n\s*(\d+)/i, expected, 'Finanțe: Cu restanțe');
  83  | });
  84  | 
  85  | test('the keyboard reaches „Înregistrează” in the payment dialog', async ({ page }) => {
  86  |   // Two focus traps (the Modal's and the dialog's own) used to skip the last
  87  |   // control, so Tab never landed on the button that records the payment.
  88  |   await signIn(page, 'admin');
  89  |   await page.goto('/admin/finance');
  90  |   const row = page.getByText('Radu Stan', { exact: true }).first()
  91  |     .locator('xpath=ancestor::*[.//*[normalize-space(text())="Încasează"]][1]');
  92  |   await row.getByText('Încasează', { exact: true }).click();
  93  |   const dialog = page.getByRole('dialog', { name: /Încasare/ });
  94  |   await expect(dialog.getByRole('button', { name: /^Înregistrează/ })).toBeEnabled();
  95  | 
  96  |   let reached = false;
  97  |   for (let i = 0; i < 30 && !reached; i++) {
  98  |     await page.keyboard.press('Tab');
  99  |     reached = await page.evaluate(() => /^Înregistrează/.test(document.activeElement?.textContent?.trim() ?? ''));
  100 |   }
  101 |   expect(reached, 'Tab lands on „Înregistrează”').toBe(true);
  102 | 
  103 |   await page.keyboard.press('Escape');
  104 |   await expect(dialog).toHaveCount(0);
  105 | });
  106 | 
```