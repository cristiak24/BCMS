/**
 * Părinte (audit runda 3, R4): a parent with two children switches between
 * them and every screen reloads for the one selected; a parent delegated to
 * keep the stats of Matei's match opens it even with Ana (another team)
 * selected — before WP4A that was "Meciul nu există".
 */
import { test, expect, signIn, apiAs, seedIds } from '../support/fixtures';

test('switching child reloads the screens for that child', async ({ page }) => {
  const { players } = seedIds();
  await signIn(page, 'parent');
  await page.addInitScript((id) => {
    if (!window.sessionStorage.getItem('e2e.child-set')) {
      window.localStorage.setItem('bcms.child-id', String(id));
      window.sessionStorage.setItem('e2e.child-set', '1');
    }
  }, players.matei);

  await page.goto('/team');
  await expect(page.getByRole('button', { name: 'Copil: Matei Popescu. Schimbă copilul' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Deschide echipa U12 Masculin' })).toBeVisible();

  await page.getByRole('button', { name: /Schimbă copilul/ }).click();
  await page.getByRole('menu').getByRole('menuitem').filter({ hasText: 'Ana Dumitrescu' }).click();
  await expect(page.getByRole('button', { name: 'Copil: Ana Dumitrescu. Schimbă copilul' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Deschide echipa U14 Feminin' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Deschide echipa U12 Masculin' })).toHaveCount(0);
  expect(await page.evaluate(() => window.localStorage.getItem('bcms.child-id'))).toBe(String(players.ana));

  // Another screen loads for Ana too (U14's training, not U12's).
  await page.goto('/myclub');
  await expect(page.getByText('Antrenament U14').first()).toBeVisible();
  await expect(page.getByText('Antrenament U12')).toHaveCount(0);

  await page.getByRole('button', { name: /Schimbă copilul/ }).click();
  await page.getByRole('menu').getByRole('menuitem').filter({ hasText: 'Matei Popescu' }).click();
  await expect(page.getByText('Antrenament U12').first()).toBeVisible();
  await expect(page.getByText('Antrenament U14')).toHaveCount(0);
});

test('the delegated parent opens the match with the other child selected', async ({ page }) => {
  const { events, players, users } = seedIds();
  const admin = await apiAs('admin');
  const { lineup } = await (await admin.get(`games/events/${events.delegatedMatch}`)).json() as { lineup: { playerId: number }[] };
  const ids = lineup.map((p) => p.playerId);
  const setup = await admin.put(`games/events/${events.delegatedMatch}/setup`, {
    data: { mode: 'simple', roster: ids, starters: ids.slice(0, 5), opponentName: 'CS Oaspeți', scorekeeperUserId: users.parent },
  });
  expect(setup.status()).toBe(200);

  await signIn(page, 'parent');
  await page.addInitScript((id) => window.localStorage.setItem('bcms.child-id', String(id)), players.ana);
  await page.goto('/myclub');
  await expect(page.getByRole('button', { name: 'Copil: Ana Dumitrescu. Schimbă copilul' })).toBeVisible();
  const banner = page.getByRole('button').filter({ hasText: /ții statistica/i }).filter({ hasText: 'Amical U12 (delegat)' });
  await banner.click();

  await expect(page).toHaveURL(new RegExp(`/stats/${events.delegatedMatch}$`));
  await expect(page.getByText('Amical U12 (delegat)').first()).toBeVisible();
  await expect(page.getByText('Nu am putut deschide meciul')).toHaveCount(0);
  // Four days ahead: the scorer asks before it starts (WP7-C1).
  await page.getByRole('button', { name: 'Pornește oricum' }).click();
  await expect(page.getByText('CS Oaspeți').first()).toBeVisible();
});
