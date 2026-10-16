import '../test/pgliteEnv';
import { bearer } from '../test/fakeClerk';
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { db } from '../db';
import { clubs, players, teams, users } from '../db/schema';
import { closeDb, createSchema } from '../test/pgliteDb';
import { serve } from '../test/serve';
import financeRouter from './finance';

/**
 * P1-1 from the 2026-10-15 audit: a manual payment of 99 999 999 999 came
 * back as a 500 carrying the full INSERT with its parameters.
 */

let playerId = 0;
let api: Awaited<ReturnType<typeof serve>>;
const admin = bearer('user_fin_admin', 'fin.admin@club.ro');

before(async () => {
    await createSchema();
    const [club] = await db.insert(clubs).values({ name: 'Club Bani', normalizedName: 'club bani' }).returning();
    await db.insert(users).values({ email: 'fin.admin@club.ro', name: 'Admin', role: 'admin', status: 'active', clubId: club.id, firebaseUid: 'user_fin_admin' });
    const [team] = await db.insert(teams).values({
        frbTeamId: '', name: 'U12', frbLeagueId: '', leagueName: 'Liga', frbSeasonId: '', seasonName: '2026', inviteCode: 'FIN123', clubId: club.id,
    }).returning();
    [{ id: playerId }] = await db.insert(players).values({ clubId: club.id, teamId: team.id, firstName: 'Matei', lastName: 'Pop' } as typeof players.$inferInsert).returning();
    api = await serve({ '/api/finance': financeRouter });
});

after(async () => {
    await api.close();
    await closeDb();
});

test('an amount too large for the ledger is refused up front, without SQL in the answer', async () => {
    const quiet = console.error;
    console.error = () => undefined;
    try {
        const out = await api.call('POST', '/api/finance/admin/manual-payment', { auth: admin, body: { playerId, amount: 99999999999 } });
        assert.equal(out.status, 400);
        assert.equal(out.body.error, 'Suma este prea mare.');
        assert.doesNotMatch(JSON.stringify(out.body), /insert|player_payments|params/i);
    } finally {
        console.error = quiet;
    }
});
