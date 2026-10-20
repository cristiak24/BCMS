/**
 * Securitate (audit P0-1, R3-2, R3-3, runda 3): API-level checks with real
 * tokens of the seeded accounts.
 *  - an invitation is accepted only by the invited (verified) email, once;
 *  - the coach of another team gets 403 on L12 and on the live scorer;
 *  - a player and a parent get 403/404 on every staff action.
 */
import { test, expect, apiAs, seedIds } from '../support/fixtures';

const FORBIDDEN = [403, 404];

test.describe('invitație', () => {
  test.describe.configure({ mode: 'serial' });

  test('accepting with someone else\'s email is refused, even when the body claims it', async () => {
    const { invite } = seedIds();
    const attacker = await apiAs('atacator@evil.test');
    const response = await attacker.post(`invitations/${invite.token}/accept`, { data: { email: invite.email, firstName: 'Atacator' } });
    expect(response.status()).toBeGreaterThanOrEqual(400);
    expect(response.status()).toBeLessThan(500);
    expect((await response.json()).error).toMatch(/altă adresă de email/);
  });

  test('the invited person accepts once; the token cannot be used again', async () => {
    const { invite } = seedIds();
    const invited = await apiAs(invite.email);
    // A coach invitation: no phone number, no account (R3-19) — and the
    // invitation stays usable.
    const noPhone = await invited.post(`invitations/${invite.token}/accept`, { data: { firstName: 'Invitat', lastName: 'Nou' } });
    expect(noPhone.status()).toBe(400);
    expect((await noPhone.json()).error).toMatch(/numărul de telefon/);
    const first = await invited.post(`invitations/${invite.token}/accept`, { data: { firstName: 'Invitat', lastName: 'Nou', phone: '0722 000 111' } });
    expect(first.status()).toBe(201);
    const me = await (await invited.get('auth/me')).json();
    expect(me.user.email).toBe(invite.email);

    const again = await invited.post(`invitations/${invite.token}/accept`, { data: {} });
    expect(again.status()).toBeGreaterThanOrEqual(400);
    expect(again.status()).toBeLessThan(500);

    const latecomer = await apiAs('alt-atacator@evil.test');
    const reuse = await latecomer.post(`invitations/${invite.token}/accept`, { data: { email: invite.email } });
    expect(reuse.status()).toBeGreaterThanOrEqual(400);
    expect(reuse.status()).toBeLessThan(500);
    // The attacker got no profile out of it.
    expect((await latecomer.get('auth/me')).status()).toBe(404);
  });
});

test.describe('antrenorul altei echipe', () => {
  test('gets 403 on the L12 of a team they do not coach', async () => {
    const { teams, events } = seedIds();
    const coach = await apiAs('coach'); // U12 only
    expect((await coach.get(`l12/teams/${teams.u14}/template`)).status()).toBe(403);
    expect((await coach.put(`l12/teams/${teams.u14}/template`, { data: { players: [] } })).status()).toBe(403);
    expect((await coach.put(`l12/events/${events.u14Match}`, { data: { players: [] } })).status()).toBe(403);
    // Their own team still works.
    expect((await coach.get(`l12/teams/${teams.u12}/template`)).status()).toBe(200);
  });

  test('gets 403 on the scorer of a match of a team they do not coach', async () => {
    const { events } = seedIds();
    const admin = await apiAs('admin');
    const keepers = await admin.get(`games/events/${events.u14Match}`);
    expect(keepers.status()).toBe(200);
    const { lineup } = await keepers.json() as { lineup: { playerId: number }[] };
    const ids = lineup.map((p) => p.playerId);
    const setup = await admin.put(`games/events/${events.u14Match}/setup`, {
      data: { mode: 'simple', roster: ids, starters: ids.slice(0, 5), opponentName: 'CSS Test' },
    });
    expect(setup.status()).toBe(200);

    const coach = await apiAs('coach');
    expect((await coach.put(`games/events/${events.u14Match}/setup`, { data: { mode: 'simple', roster: ids, starters: ids.slice(0, 5) } })).status()).toBe(403);
    const point = { clientId: 'e2e-intrus-0001', seq: 0, period: 1, side: 'us', playerId: ids[0], type: 'pts2' };
    expect((await coach.post(`games/events/${events.u14Match}/events`, { data: { events: [point] } })).status()).toBe(403);
    expect((await coach.post(`games/events/${events.u14Match}/finish`, { data: {} })).status()).toBe(403);
    // The U14 coach may.
    const coach2 = await apiAs('coach2');
    expect((await coach2.put(`games/events/${events.u14Match}/setup`, { data: { mode: 'simple', roster: ids, starters: ids.slice(0, 5) } })).status()).toBe(200);
  });
});

test.describe('jucător și părinte', () => {
  for (const role of ['player', 'parent'] as const) {
    test(`${role}: every staff action is refused`, async () => {
      const { teams, players, events, clubId } = seedIds();
      const api = await apiAs(role);
      const future = new Date(Date.now() + 86_400_000);
      const attempts: Array<[string, () => ReturnType<typeof api.get>]> = [
        ['creează eveniment', () => api.post('events', { data: { title: 'Intrus', type: 'training', teamId: teams.u12, startTime: future.toISOString(), endTime: new Date(future.getTime() + 3_600_000).toISOString() } })],
        ['șterge eveniment', () => api.delete(`events/${events.u12Match}`)],
        ['notează prezența', () => api.post(`events/${events.u12Match}/attendance`, { data: { playerAttendances: [{ playerId: players.matei, status: 'present' }] } })],
        ['încasare manuală', () => api.post('finance/admin/manual-payment', { data: { playerId: players.matei, amount: 10, method: 'cash' } })],
        ['solduri club', () => api.get('finance/admin/balances')],
        ['setări financiare', () => api.patch('finance/settings', { data: { monthlyPlayerFee: 1 } })],
        ['scorer: pregătire', () => api.put(`games/events/${events.u12Match}/setup`, { data: { mode: 'simple', roster: [], starters: [] } })],
        ['L12', () => api.put(`l12/teams/${teams.u12}/template`, { data: { players: [] } })],
        ['editare jucător', () => api.put(`players/${players.radu}`, { data: { number: 99 } })],
        ['alt jucător', () => api.get(`players/${players.elena}`)],
        ['dashboard club', () => api.get('dashboard/summary')],
        ['conturi club', () => api.get('club-admin/accounts')],
        ['echipă: editare', () => api.patch(`teams/${teams.u12}`, { data: { name: 'Furat' } })],
        ['echipă: jucători noi', () => api.post(`teams/${teams.u12}/players/bulk`, { data: { players: [{ firstName: 'Intrus', lastName: 'Test' }] } })],
        ['invitație cont', () => api.post('club-admin/accounts/invitations', { data: { email: 'x@evil.test', role: 'admin', clubId } })],
      ];
      const allowed: string[] = [];
      for (const [label, attempt] of attempts) {
        const response = await attempt();
        const status = response.status();
        // A 404 must come from the route refusing, not from a route that does not exist.
        if (status === 404) expect(await response.text(), `${label}: route exists`).not.toContain('API route not found');
        if (!FORBIDDEN.includes(status)) allowed.push(`${label} → ${status}`);
      }
      expect(allowed, 'staff actions that were not refused').toEqual([]);

      // The squad list is readable by members, without anyone's personal data.
      const roster = await (await api.get('players/roster')).json() as Array<Record<string, unknown>>;
      expect(roster.length).toBeGreaterThan(0);
      for (const row of roster) {
        for (const field of ['medicalCheckExpiry', 'phone', 'guardianPhone', 'guardian2Phone', 'email', 'paymentStatus']) {
          expect(row[field] ?? null, `${String(row.name)}.${field}`).toBeNull();
        }
      }
    });
  }
});
