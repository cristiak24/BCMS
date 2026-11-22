/**
 * Critique 6 (P1): work lost on a bad connection. Attendance taps made with no
 * signal used to bounce back; they now stay on screen and on the device and go
 * out when the connection returns (hooks/useAttendanceOutbox.ts).
 */
import { test, expect, signIn, apiAs, seedIds } from '../support/fixtures';

const TITLE = `Antrenament offline E2E ${Date.now() % 100000}`;
let eventId: number;

test.beforeAll(async () => {
  const { teams } = seedIds();
  const admin = await apiAs('admin');
  const start = new Date(Date.now() - 2 * 3_600_000);
  const response = await admin.post('events', {
    data: { title: TITLE, type: 'training', teamId: teams.u12, location: 'Sala Sporturilor', startTime: start.toISOString(), endTime: new Date(start.getTime() + 3_600_000).toISOString() },
  });
  expect(response.ok()).toBe(true);
  eventId = (await response.json()).id;
});

test('an attendance mark made offline waits on the device and is sent later', async ({ page, consoleErrors }) => {
  const { players } = seedIds();
  await signIn(page, 'admin');
  const offline = (route: import('@playwright/test').Route) => (route.request().method() === 'POST' ? route.abort('internetdisconnected') : route.continue());
  await page.route(`**/api/events/${eventId}/attendance`, offline);

  await page.goto(`/admin/attendance/${eventId}`);
  const present = page.getByRole('radio', { name: 'Prezent: Radu Stan' });
  await present.click();
  await expect(page.getByText('1 marcaj așteaptă conexiunea').first()).toBeVisible();
  await expect(present).toHaveAttribute('aria-checked', 'true');

  // Still there after a reload while offline.
  await page.reload();
  await expect(page.getByText('1 marcaj așteaptă conexiunea').first()).toBeVisible();
  await expect(page.getByRole('radio', { name: 'Prezent: Radu Stan' })).toHaveAttribute('aria-checked', 'true');

  // Back online: „Trimite acum” sends it.
  await page.unroute(`**/api/events/${eventId}/attendance`, offline);
  const saved = page.waitForResponse((r) => r.url().includes(`/events/${eventId}/attendance`) && r.request().method() === 'POST');
  await page.getByRole('button', { name: 'Trimite acum' }).click();
  expect((await saved).status()).toBe(200);
  await expect(page.getByText('Salvat automat')).toBeVisible();

  const admin = await apiAs('admin');
  const rows = await (await admin.get(`events/${eventId}/attendance`)).json() as Array<{ playerId: number; status: string }>;
  expect(rows.find((row) => row.playerId === players.radu)?.status).toBe('present');
  // The dropped requests are the scenario itself.
  consoleErrors.splice(0, consoleErrors.length, ...consoleErrors.filter((e) => !/ERR_INTERNET_DISCONNECTED|Failed to fetch|Failed to load resource/i.test(e)));
});

/**
 * Val 2 review: while the outbox was sending an older mark, a new tap for the
 * same player went out directly; when it landed first, the older batch
 * overwrote it on the server while the screen showed the new one. A tap made
 * while a batch is on its way now waits behind it.
 */
test('a mark tapped while an older one is being sent ends up on the server', async ({ page, consoleErrors }) => {
  const { players } = seedIds();
  await signIn(page, 'admin');
  const url = `**/api/events/${eventId}/attendance`;
  const offline = (route: import('@playwright/test').Route) => (route.request().method() === 'POST' ? route.abort('internetdisconnected') : route.continue());
  await page.route(url, offline);
  await page.goto(`/admin/attendance/${eventId}`);
  await page.getByRole('radio', { name: 'Absent: Radu Stan' }).click();
  await expect(page.getByText('1 marcaj așteaptă conexiunea').first()).toBeVisible();

  // Back online, but the outbox's batch (Absent) is slow to arrive.
  await page.unroute(url, offline);
  let release!: () => void;
  const released = new Promise<void>((resolve) => { release = resolve; });
  let held = false;
  const slowFirst = async (route: import('@playwright/test').Route) => {
    if (route.request().method() !== 'POST' || held) return route.fallback();
    held = true;
    await released;
    return route.fallback();
  };
  await page.route(url, slowFirst);
  await page.getByRole('button', { name: 'Trimite acum' }).click();
  await expect.poll(() => held).toBe(true);

  // The coach changes their mind while it is on its way.
  await page.getByRole('radio', { name: 'Prezent: Radu Stan' }).click();
  await page.waitForTimeout(500);
  release();
  await expect(page.getByText('Salvat automat')).toBeVisible();
  await expect(page.getByText(/așteaptă conexiunea/)).toHaveCount(0);
  await expect(page.getByRole('radio', { name: 'Prezent: Radu Stan' })).toHaveAttribute('aria-checked', 'true');

  const admin = await apiAs('admin');
  await expect.poll(async () => {
    const rows = await (await admin.get(`events/${eventId}/attendance`)).json() as Array<{ playerId: number; status: string }>;
    return rows.find((row) => row.playerId === players.radu)?.status;
  }).toBe('present');
  await page.unroute(url, slowFirst);
  consoleErrors.splice(0, consoleErrors.length, ...consoleErrors.filter((e) => !/ERR_INTERNET_DISCONNECTED|Failed to fetch|Failed to load resource/i.test(e)));
});

test('a failed player save keeps the edit and offers „Reîncearcă”', async ({ page, consoleErrors }) => {
  const { players } = seedIds();
  await signIn(page, 'admin');
  await page.route(`**/api/players/${players.luca}`, (route) => (route.request().method() === 'PUT' ? route.abort('internetdisconnected') : route.continue()));
  await page.goto(`/admin/player/${players.luca}`);
  const shirt = page.getByLabel('Număr tricou');
  await expect(shirt).not.toHaveValue('');
  await shirt.fill('77');
  await page.getByRole('button', { name: /^Salvează$/ }).first().click();
  await expect(page.getByText('Nu s-a salvat', { exact: true })).toBeVisible();
  await expect(shirt).toHaveValue('77');
  await expect(page.getByRole('button', { name: 'Reîncearcă' })).toBeVisible();
  consoleErrors.splice(0, consoleErrors.length, ...consoleErrors.filter((e) => !/ERR_INTERNET_DISCONNECTED|Failed to fetch|Failed to load resource/i.test(e)));
});
