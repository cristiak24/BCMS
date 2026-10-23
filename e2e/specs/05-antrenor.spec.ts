/**
 * Antrenor (audit R3-1): a session the admin creates for the coach's team
 * (no coach picked on the event) shows up for that coach, who can mark
 * attendance on it. Before WP4A only events with event.coachId === coach
 * were shown, so admin-created sessions were invisible; a coach with no
 * events of their own saw the whole club instead.
 */
import { test, expect, signIn, apiAs, seedIds } from '../support/fixtures';

const TITLE = `Sesiune admin E2E ${Date.now() % 100000}`;
let eventId: number;

test.beforeAll(async () => {
  const { teams } = seedIds();
  const admin = await apiAs('admin');
  // Started two hours ago: attendance is for sessions that took place.
  const start = new Date(Date.now() - 2 * 3_600_000);
  const response = await admin.post('events', {
    data: { title: TITLE, type: 'training', teamId: teams.u12, location: 'Sala Sporturilor', startTime: start.toISOString(), endTime: new Date(start.getTime() + 3_600_000).toISOString() },
  });
  expect(response.ok()).toBe(true);
  const created = await response.json();
  expect(created.coachId).toBeNull();
  eventId = created.id;
});

test('the team\'s coach sees the session and marks attendance', async ({ page }) => {
  const { players } = seedIds();
  await signIn(page, 'coach');
  await page.goto('/coach/attendance');
  const session = page.getByRole('button', { name: new RegExp(`^${TITLE}`) });
  await expect(session).toBeVisible();
  await session.click();
  await expect(page.getByText(TITLE).first()).toBeVisible();

  const mateiRow = page.getByText('Matei Popescu', { exact: true })
    .locator('xpath=ancestor::*[.//*[@aria-label="Prezent: Matei Popescu"]][1]');
  await expect(mateiRow).toContainText('Fără marcaj');
  const saved = page.waitForResponse((r) => r.url().includes(`/events/${eventId}/attendance`) && r.request().method() === 'POST');
  await page.getByRole('radio', { name: 'Prezent: Matei Popescu' }).click();
  expect((await saved).status()).toBe(200);

  const admin = await apiAs('admin');
  const rows = await (await admin.get(`events/${eventId}/attendance`)).json() as Array<{ playerId: number; status: string }>;
  expect(rows.find((row) => row.playerId === players.matei)?.status).toBe('present');

  // Still marked after a reload.
  await page.reload();
  await page.getByRole('button', { name: new RegExp(`^${TITLE}`) }).click();
  await expect(mateiRow).toBeVisible();
  await expect(mateiRow).not.toContainText('Fără marcaj');
});

test('the coach of another team does not see it', async ({ page }) => {
  await signIn(page, 'coach2');
  await page.goto('/coach/attendance');
  await expect(page.getByRole('button', { name: /^Meci U14 vs\. CSS Test/ })).toBeVisible();
  await expect(page.getByRole('button', { name: new RegExp(`^${TITLE}`) })).toHaveCount(0);
});
