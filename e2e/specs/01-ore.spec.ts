/**
 * Ore (audit P0-3, R3-4): a training entered at 19:00 in the admin form reads
 * 19:00 everywhere — event page, calendar, the player's "Echipa mea", the
 * parent's home — with the API in UTC (as on Render) and the browser in
 * Europe/Bucharest. Before WP3 it showed 22:00 (form) and 15:00/16:00
 * (raw DB text on "Echipa mea").
 */
import { test, expect, signIn, apiAs, seedIds } from '../support/fixtures';

const TITLE = 'Antrenament E2E ora 19';

/**
 * The calendar day (Bucharest) of the seeded U12 training "tomorrow 18:00 UTC":
 * 19:00 Bucharest that day is always in the future and before that training,
 * so ours is the team's next event whatever time the suite runs.
 */
function targetDay() {
  const day = new Date();
  day.setUTCDate(day.getUTCDate() + 1);
  return day.toISOString().slice(0, 10);
}

/** On the last day of a month „tomorrow” is next month, while Program opens on this one. */
async function showTargetMonth(page: import('@playwright/test').Page) {
  const thisMonth = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Bucharest' }).slice(0, 7);
  if (targetDay().slice(0, 7) !== thisMonth) await page.getByRole('button', { name: 'Luna următoare' }).click();
}

test.describe.configure({ mode: 'serial' });

let eventId: number;

test('admin creates a training at 19:00 from the form', async ({ page }) => {
  await signIn(page, 'admin');
  await page.goto('/admin/schedule');
  await page.getByRole('button', { name: 'Adaugă eveniment' }).click();

  await page.getByLabel('Titlu').fill(TITLE);
  await page.getByLabel('Echipă').selectOption({ label: 'U12 Masculin' });
  await page.getByLabel('Locație').fill('Sala E2E');
  await page.getByLabel('Data de început').fill(targetDay());
  await page.getByLabel('Ora de început').fill('19:00');
  await page.getByLabel('Ora de sfârșit').fill('20:30');
  await page.getByRole('button', { name: 'Salvează evenimentul', exact: true }).click();
  await showTargetMonth(page);
  await expect(page.getByText(TITLE).first()).toBeVisible();

  const api = await apiAs('admin');
  const events = await (await api.get('events')).json() as Array<{ id: number; title: string; startTime: string; endTime: string }>;
  const created = events.find((event) => event.title === TITLE);
  expect(created, 'the event exists in the API').toBeTruthy();
  eventId = created!.id;
  // Stored as the instant 19:00 in Bucharest, whatever the season.
  const wall = new Intl.DateTimeFormat('ro-RO', { timeZone: 'Europe/Bucharest', hour: '2-digit', minute: '2-digit' });
  expect(wall.format(new Date(created!.startTime))).toBe('19:00');
  expect(wall.format(new Date(created!.endTime))).toBe('20:30');
});

test('the event page shows 19:00', async ({ page }) => {
  await signIn(page, 'admin');
  await page.goto(`/admin/event/${eventId}`);
  await expect(page.getByText(TITLE).first()).toBeVisible();
  await expect(page.getByText(/19:00/).first()).toBeVisible();
  await expect(page.getByText(/22:00|16:00/)).toHaveCount(0);
});

test('the calendar shows 19:00 – 20:30', async ({ page }) => {
  await signIn(page, 'admin');
  await page.goto('/admin/schedule');
  await page.getByRole('tab', { name: 'Agendă' }).click();
  await showTargetMonth(page);
  const entry = page.getByRole('button').filter({ hasText: TITLE });
  await expect(entry.first()).toContainText('19:00 - 20:30');
});

test('the player sees 19:00 on "Echipa mea"', async ({ page }) => {
  await signIn(page, 'player');
  await page.goto('/team');
  await expect(page.getByText(`Urmează: ${TITLE}`)).toContainText('19:00');
});

test('the parent sees 19:00 on the home screen', async ({ page }) => {
  const { players } = seedIds();
  await signIn(page, 'parent');
  // Matei (U12) selected.
  await page.addInitScript((id) => window.localStorage.setItem('bcms.child-id', String(id)), players.matei);
  await page.goto('/myclub');
  const card = page.getByText(TITLE).first().locator('xpath=ancestor::*[contains(., "19:00 - 20:30")][1]');
  await expect(card).toBeVisible();
});
