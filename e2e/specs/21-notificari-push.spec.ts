/**
 * Notificări pe dispozitiv (Val 3B): the profile card in its states (ready to
 * turn on, blocked by the browser, active with per-type switches), none for a
 * role that receives nothing, and the landing of a tapped push — the right
 * child, the event's sheet open, the notification read, the link's extras gone.
 *
 * The suite blocks service workers and has no push service, so the browser's
 * side is a stub: a registration whose subscription is the one this spec
 * registered through the API on a non-routable host.
 */
import type { Page } from '@playwright/test';
import { test, expect, signIn, apiAs, seedIds, expectNoHorizontalScroll } from '../support/fixtures';

const browserKeys = { p256dh: 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM', auth: 'tBHItJI5svbpez7KI4CCXg' };
const ENDPOINT = 'https://push.invalid/e2e/parent-phone';

async function stubPush(page: Page, options: { endpoint?: string | null; permission?: NotificationPermission } = {}) {
  await page.addInitScript(({ endpoint, permission }) => {
    const subscription = endpoint
      ? { endpoint, options: { applicationServerKey: null }, getKey: () => new ArrayBuffer(65), unsubscribe: async () => true }
      : null;
    const registration = {
      pushManager: {
        getSubscription: async () => subscription,
        subscribe: async () => { throw new Error('no push service in E2E'); },
      },
    };
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: {
        register: async () => registration,
        getRegistration: async () => registration,
        ready: Promise.resolve(registration),
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
      },
    });
    if (permission) Object.defineProperty(Notification, 'permission', { configurable: true, get: () => permission });
  }, { endpoint: options.endpoint ?? null, permission: options.permission ?? null });
}

const card = (page: Page) => page.getByText('Notificări pe dispozitiv', { exact: true });

test('a parent can turn push on from the profile; nothing is asked before the tap', async ({ page }) => {
  let asked = false;
  await page.exposeFunction('__pushAsked', () => { asked = true; });
  await page.addInitScript(() => {
    Notification.requestPermission = async () => { (window as any).__pushAsked(); return 'default'; };
  });
  // Headless Chromium answers „denied” by default; a real browser starts at „default”.
  await stubPush(page, { permission: 'default' });
  await page.setViewportSize({ width: 375, height: 812 });
  await signIn(page, 'parent');
  await page.goto('/account');

  await expect(card(page)).toBeVisible();
  const enable = page.getByRole('button', { name: 'Activează pe acest dispozitiv' });
  await expect(enable).toBeVisible();
  await expect(page.getByText('Browserul îți va cere permisiunea. Le poți opri oricând de aici.')).toBeVisible();
  await expectNoHorizontalScroll(page);
  expect(asked, 'no permission prompt on opening the app').toBe(false);

  // Dismissing the browser's dialog leaves the card as it was.
  await enable.click();
  await expect.poll(() => asked).toBe(true);
  await expect(enable).toBeVisible();
});

test('blocked in the browser: the card says so and how to undo it', async ({ page }) => {
  await stubPush(page, { permission: 'denied' });
  await page.setViewportSize({ width: 1280, height: 900 });
  await signIn(page, 'parent', { theme: 'dark' });
  await page.goto('/account');
  await expect(page.getByText('Blocate din browser')).toBeVisible();
  await expect(page.getByText(/Pe calculator: apasă iconița de lângă adresă/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Am schimbat setarea, verifică din nou' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Activează pe acest dispozitiv' })).toHaveCount(0);
});

test('active on this device: per-type switches save at once; other devices can be removed', async ({ page }) => {
  const parent = await apiAs('parent');
  expect((await parent.put('push/subscription', { data: { endpoint: ENDPOINT, keys: browserKeys, label: 'Android · Chrome' } })).status()).toBe(200);
  expect((await parent.put('push/subscription', { data: { endpoint: `${ENDPOINT}-old`, keys: browserKeys, label: 'Mac · Safari' } })).status()).toBe(200);
  try {
    await stubPush(page, { endpoint: ENDPOINT, permission: 'granted' });
    await page.setViewportSize({ width: 375, height: 812 });
    await signIn(page, 'parent');
    await page.goto('/account');

    await expect(page.getByText('Active pe acest dispozitiv')).toBeVisible();
    for (const name of ['Evenimente noi', 'Program modificat sau anulat', 'Cereri de confirmare', 'Plăți restante']) {
      await expect(page.getByRole('switch', { name })).toHaveAttribute('aria-checked', 'true');
    }
    await expect(page.getByRole('switch', { name: 'Absențe anunțate' })).toHaveCount(0);

    await page.getByRole('switch', { name: 'Plăți restante' }).click();
    await expect(page.getByRole('switch', { name: 'Plăți restante' })).toHaveAttribute('aria-checked', 'false');
    await expect.poll(async () => (await (await parent.get('push/me')).json()).preferences.payment_overdue).toBe(false);

    await page.getByRole('button', { name: 'Elimină Mac · Safari' }).click();
    await expect(page.getByText('Mac · Safari')).toHaveCount(0);
    await expect.poll(async () => (await (await parent.get('push/me')).json()).devices.length).toBe(1);
    await expectNoHorizontalScroll(page);
  } finally {
    await parent.put('push/preferences', { data: { payment_overdue: true } });
    await parent.post('push/unsubscribe', { data: { endpoint: ENDPOINT } });
    await parent.post('push/unsubscribe', { data: { endpoint: `${ENDPOINT}-old` } });
  }
});

test('a role that receives no push sees no card', async ({ page }) => {
  await stubPush(page);
  await signIn(page, 'accountant');
  await page.goto('/profile');
  await expect(page.getByText('Notificări', { exact: true })).toBeVisible();
  await expect(card(page)).toHaveCount(0);
});

test('a tapped push opens the event for the right child and marks the notification read', async ({ page }) => {
  const { teams, players } = seedIds();
  const admin = await apiAs('admin');
  const title = `Antrenament suplimentar ${Date.now()}`;
  const start = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
  start.setUTCHours(15, 0, 0, 0);
  const created = await admin.post('events', {
    data: { type: 'training', title, teamId: teams.u12, startTime: start.toISOString(), endTime: new Date(start.getTime() + 90 * 60 * 1000).toISOString() },
  });
  expect(created.status()).toBe(200);
  const eventId = (await created.json()).id as number;

  // „Eveniment nou” for the parent of Matei (U12).
  const parent = await apiAs('parent');
  let notificationId = 0;
  await expect.poll(async () => {
    const list = await (await parent.get('notifications')).json() as Array<{ id: number; type: string; eventId: number | null; isRead: boolean }>;
    notificationId = list.find((item) => item.type === 'event_created' && item.eventId === eventId)?.id ?? 0;
    return notificationId;
  }).toBeGreaterThan(0);

  await stubPush(page);
  await signIn(page, 'parent');
  // The parent had Ana (U14) selected; the push is about Matei.
  await page.addInitScript((id) => window.localStorage.setItem('bcms.child-id', String(id)), players.ana);
  await page.goto(`/schedule?event=${eventId}&child=${players.matei}&n=${notificationId}`);

  await expect(page.getByRole('dialog').getByText(title)).toBeVisible();
  expect(new URL(page.url()).search).toBe(`?event=${eventId}`);
  expect(await page.evaluate(() => window.localStorage.getItem('bcms.child-id'))).toBe(String(players.matei));
  await expect.poll(async () => {
    const list = await (await parent.get('notifications')).json() as Array<{ id: number; isRead: boolean }>;
    return list.find((item) => item.id === notificationId)?.isRead;
  }).toBe(true);

  await admin.delete(`events/${eventId}`);
});
