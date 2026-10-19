/**
 * Scorer (audit runda 2, runda 5): a simple-mode match from setup to final —
 * points, fouls, an undo, the next quarter, the final whistle — gives the
 * right box score; actions recorded offline wait on the phone and reach the
 * server once, without duplicates, when the connection is back.
 */
import type { Page } from '@playwright/test';
import { test, expect, signIn, apiAs, seedIds } from '../support/fixtures';

type GamePayload = {
  game: { status: string; scoreUs: number; scoreThem: number; currentPeriod: number } | null;
  events: Array<{ clientId: string; type: string; side: string; playerId: number | null; period: number; deleted: boolean }>;
};

/** A player on court, by surname (shirt numbers are editable elsewhere). */
async function player(page: Page, surname: string, action: '+1 liber' | '+2' | '+3' | 'Fault') {
  await page.getByRole('button', { name: new RegExp(`^#\\d+ ${surname},`) }).click();
  await page.getByRole('button', { name: action, exact: true }).click();
}

async function opponent(page: Page, action: '+1' | '+2' | '+3' | 'Fault') {
  await page.getByRole('button', { name: `CS Oaspeți ${action}`, exact: true }).click();
}

// Nothing left on the phone: neither typed actions ("1 acțiune salvată" /
// "3 acțiuni salvate pe telefon") nor the automatic quarter markers
// ("Se sincronizează…"). The singular never matched `salvat(e)?`.
const synced = (page: Page) => expect(page.getByText(/salvat[eă]? pe telefon|Se sincronizează/)).toHaveCount(0, { timeout: 15_000 });

test('a simple match from setup to final, with an offline stretch', async ({ page, context, consoleErrors }) => {
  const { events } = seedIds();
  const eventId = events.u12Match;
  await signIn(page, 'admin');
  await page.goto(`/admin/stats/${eventId}`);

  // Setup: simple mode, the first five as starters, the opponent's name.
  await page.getByRole('button', { name: /^Simplu/ }).click();
  for (const name of ['Luca Marin', 'Matei Popescu', 'Andrei Vasile', 'Mihai Georgescu', 'Tudor Pop']) {
    await page.getByRole('button', { name: `${name} joacă` }).locator('xpath=..').getByRole('button', { name: 'Titular' }).click();
  }
  await page.getByLabel('Numele echipei adverse').fill('CS Oaspeți');
  await page.getByRole('button', { name: 'Începe meciul' }).click();
  // The seeded match is two days ahead: the scorer asks first (WP7-C1).
  await expect(page.getByText('Meciul e programat mai târziu')).toBeVisible();
  await page.getByRole('button', { name: 'Pornește oricum' }).click();
  await expect(page.getByText('Sfertul 1')).toBeVisible();

  // Quarter 1: us 2 + 3 + 1 = 6 (a +2 undone), them 2; one foul each.
  await player(page, 'Popescu', '+2');
  await player(page, 'Popescu', '+3');
  await player(page, 'Marin', '+1 liber');
  await player(page, 'Vasile', 'Fault');
  await opponent(page, '+2');
  await opponent(page, 'Fault');
  await player(page, 'Marin', '+2');
  await page.getByRole('button', { name: 'Anulează ultima acțiune' }).click();
  await expect(page.getByRole('button', { name: /^#\d+ Marin, 1 punct/ })).toBeVisible();
  await synced(page);

  await page.getByRole('button', { name: 'Sfertul următor' }).click();
  await page.getByRole('button', { name: 'Începe sfertul următor' }).click();
  await expect(page.getByText('Sfertul 2')).toBeVisible();
  await player(page, 'Georgescu', '+2'); // us 8
  await synced(page);

  // Offline: three actions stay on the phone, then go out once.
  await context.setOffline(true);
  await player(page, 'Pop', '+2'); // us 10
  await opponent(page, '+3'); // them 5
  await player(page, 'Popescu', 'Fault');
  await expect(page.getByText(/3 acțiuni salvate pe telefon/)).toBeVisible();
  await context.setOffline(false);
  await synced(page);
  // The failed requests while offline are expected noise.
  consoleErrors.splice(0, consoleErrors.length, ...consoleErrors.filter((e) => !/ERR_INTERNET_DISCONNECTED|Failed to fetch|NetworkError/i.test(e)));

  const admin = await apiAs('admin');
  const live = await (await admin.get(`games/events/${eventId}`)).json() as GamePayload;
  const ids = live.events.map((e) => e.clientId);
  expect(new Set(ids).size, 'no duplicate actions on the server').toBe(ids.length);
  expect(live.game).toMatchObject({ scoreUs: 10, scoreThem: 5, currentPeriod: 2 });

  // Final whistle → the match sheet.
  const finish = page.getByRole('button', { name: 'Încheie meciul', exact: true });
  await finish.click();
  // The confirmation dialog repeats the label on its confirm button.
  await expect(finish).toHaveCount(2);
  await finish.last().click();
  await expect(page.getByText('Final', { exact: true })).toBeVisible();

  const final = await (await admin.get(`games/events/${eventId}`)).json() as GamePayload;
  expect(final.game).toMatchObject({ status: 'finished', scoreUs: 10, scoreThem: 5 });
  // Exactly one action was undone.
  expect(final.events.filter((e) => e.deleted)).toHaveLength(1);

  // The sheet: per quarter, and per player (points, fouls).
  const row = async (name: string) => (await page.getByRole('row').filter({ hasText: name }).first().innerText()).replace(/\s+/g, ' ').trim();
  await expect(page.getByRole('row').filter({ hasText: 'U12 Masculin' })).toBeVisible();
  expect(await row('U12 Masculin')).toMatch(/U12 Masculin 6 4 10$/);
  expect(await row('CS Oaspeți')).toMatch(/CS Oaspeți 2 3 5$/);
  expect(await row('Matei Popescu')).toMatch(/Matei Popescu 5 1$/);
  expect(await row('Luca Marin')).toMatch(/Luca Marin 1 0$/);
  expect(await row('Andrei Vasile')).toMatch(/Andrei Vasile 0 1$/);
  expect(await row('Mihai Georgescu')).toMatch(/Mihai Georgescu 2 0$/);
  expect(await row('Tudor Pop')).toMatch(/Tudor Pop 2 0$/);
});
