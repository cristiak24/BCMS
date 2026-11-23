/**
 * Confirmarea participării (Val 3): the player answers „Nu vin” with a reason
 * from Acasă; the coach sees it in Prezență (an indicator only, nothing marked)
 * and gets one „Absență anunțată”; a parent answers for the selected child; the
 * admin reads the grouped list on the event page; „Amintește-le” once per 12 h;
 * nothing is taken once the event has started.
 */
import { test, expect, signIn, apiAs, seedIds, expectNoHorizontalScroll } from '../support/fixtures';

type Ev = { id: number; title: string; startTime: string; teamId: number | null; type: string };

/** Tomorrow's U12 training (apps/server/src/scripts/localDb.ts). */
async function nextU12Training() {
  const coach = await apiAs('coach');
  const rows = await (await coach.get('events', { params: { start: new Date().toISOString() } })).json() as Ev[];
  const training = rows
    .filter((event) => event.title === 'Antrenament U12' && event.type === 'training' && new Date(event.startTime).getTime() > Date.now())
    .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime())[0];
  expect(training, 'a future U12 training in the seed').toBeTruthy();
  return training;
}

test('a player says „Nu vin” with a reason; the coach sees it, without any mark', async ({ page }) => {
  const training = await nextU12Training();
  await signIn(page, 'player');
  await page.goto('/myclub');

  const row = page.getByRole('button', { name: /Antrenament U12.*așteaptă răspuns/ }).first();
  await expect(row).toBeVisible();
  await row.click();

  const group = page.getByRole('radiogroup', { name: 'Participi?' });
  await expect(group).toBeVisible();
  await group.getByRole('radio', { name: 'Nu vin' }).click();
  await expect(group.getByRole('radio', { name: 'Nu vin' })).toHaveAttribute('aria-checked', 'true');
  await page.getByRole('textbox', { name: 'Motiv (opțional)' }).fill('Am școală până la 19:00');
  await page.getByRole('button', { name: 'Salvează motivul' }).click();
  await expect(page.getByRole('button', { name: 'Salvează motivul' })).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: /Antrenament U12.*, Nu vin$/ }).first()).toBeVisible();

  // The coach: the answer beside the name, the reason in its accessible name,
  // and no mark filled in for Luca.
  const coachPage = await page.context().browser()!.newPage();
  await signIn(coachPage, 'coach');
  await coachPage.goto(`/coach/attendance?event=${training.id}`);
  await expect(coachPage.getByText(/Răspunsuri: Vin \d+ · Nu vin 1 · Poate \d+ · Fără răspuns \d+/)).toBeVisible();
  await expect(coachPage.getByRole('button', { name: 'A răspuns: Nu vine. Motiv: Am școală până la 19:00' })).toBeVisible();
  await expect(coachPage.getByRole('radiogroup', { name: 'Prezență Luca Marin' }).getByRole('radio', { checked: true })).toHaveCount(0);
  await expectNoHorizontalScroll(coachPage);

  // One „Absență anunțată” for the coach, even after a change of mind.
  const player = await apiAs('player');
  expect((await player.put(`events/${training.id}/response`, { data: { status: 'going' } })).status()).toBe(200);
  expect((await player.put(`events/${training.id}/response`, { data: { status: 'not_going', reason: 'Am școală până la 19:00' } })).status()).toBe(200);
  const coach = await apiAs('coach');
  await expect.poll(async () => {
    const list = await (await coach.get('notifications')).json() as Array<{ type: string; eventId: number | null }>;
    return list.filter((item) => item.type === 'rsvp_declined' && item.eventId === training.id).length;
  }).toBe(1);
  await coachPage.close();
});

test('a parent answers for the selected child; the admin reads the grouped list', async ({ page }) => {
  const training = await nextU12Training();
  const { players } = seedIds();
  const parent = await apiAs('parent', { 'X-BCMS-Child': String(players.matei) });
  const saved = await parent.put(`events/${training.id}/response`, { data: { status: 'going' } });
  expect(saved.status()).toBe(200);

  await signIn(page, 'admin');
  await page.goto(`/admin/event/${training.id}`);
  await expect(page.getByRole('heading', { name: 'Răspunsuri', exact: true })).toBeVisible();
  await expect(page.getByText('Nu vin · 1')).toBeVisible();
  await expect(page.getByText('„Am școală până la 19:00”')).toBeVisible();
  await expect(page.getByText(/^de .+ \(părinte\)$/).first()).toBeVisible();
  await expectNoHorizontalScroll(page);
});

test('„Amintește-le” sends once per 12 hours; nothing is taken after the start', async ({ page }) => {
  const training = await nextU12Training();
  const coach = await apiAs('coach');
  // The U12 match in two days: Luca (an account) and Matei's parent have not answered.
  const upcoming = await (await coach.get('events', { params: { start: new Date().toISOString() } })).json() as Ev[];
  const match = upcoming.find((event) => event.title === 'Amical U12 (scorer)');
  expect(match).toBeTruthy();

  await signIn(page, 'coach');
  await page.goto(`/coach/attendance?event=${match!.id}`);
  await page.getByRole('button', { name: /^Amintește-le \(\d+\)$/ }).click();
  await page.getByRole('button', { name: 'Trimite amintirea' }).click();
  await expect(page.getByText(/^Amintire trimisă pentru \d+ jucători?\.$/)).toBeVisible();

  const again = await coach.post(`events/${match!.id}/responses/remind`);
  expect(again.status()).toBe(429);
  const player = await apiAs('player');
  const inbox = await (await player.get('notifications')).json() as Array<{ type: string; eventId: number | null; title: string }>;
  expect(inbox.some((item) => item.type === 'rsvp_reminder' && item.eventId === match!.id && item.title === 'Confirmă participarea')).toBe(true);

  // A session that has started: closed.
  const rows = await (await coach.get('events')).json() as Ev[];
  const past = rows.find((event) => event.title === 'Antrenament U12' && new Date(event.startTime).getTime() < Date.now());
  expect(past).toBeTruthy();
  const late = await player.put(`events/${past!.id}/response`, { data: { status: 'going' } });
  expect(late.status()).toBe(409);
  // Another team's coach can't read the answers.
  const coach2 = await apiAs('coach2');
  expect((await coach2.get(`events/${training.id}/responses`)).status()).toBe(403);
});
