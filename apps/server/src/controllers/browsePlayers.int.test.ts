import '../test/pgliteEnv';
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { db } from '../db';
import { clubs, players, playersToTeams, teams, users } from '../db/schema';
import { closeDb, createSchema } from '../test/pgliteDb';
import { playersController } from './playersController';

/**
 * GET /players/browse filters used by the team page's add panel:
 * unassigned-only, exclude the target team's members, name query, total.
 */

let clubId = 0;
let teamA = 0;
let teamB = 0;

async function browse(query: Record<string, string>) {
    let body: any;
    const req = { user: { role: 'admin', clubId }, query } as any;
    const res = { status() { return this; }, json(payload: unknown) { body = payload; return this; } } as any;
    await playersController.browsePlayers(req, res);
    return body as { items: Array<{ firstName: string; teamNames: string[] }>; hasMore: boolean; total: number };
}

const names = (body: Awaited<ReturnType<typeof browse>>) => body.items.map((item) => item.firstName).sort();

before(async () => {
    await createSchema();
    const [club] = await db.insert(clubs).values({ name: 'Club Test', normalizedName: 'club test' }).returning();
    clubId = club.id;
    const team = (name: string, inviteCode: string) => ({
        frbTeamId: '', name, frbLeagueId: '', leagueName: 'Liga', frbSeasonId: '', seasonName: '2026', inviteCode, clubId,
    });
    [{ id: teamA }, { id: teamB }] = await db.insert(teams).values([team('U12', 'AAA111'), team('U14', 'BBB222')]).returning();

    const [onA, onB] = await db.insert(players).values([
        { name: 'Ana A', firstName: 'Ana', lastName: 'Pop', teamId: teamA },
        { name: 'Bogdan B', firstName: 'Bogdan', lastName: 'Ionescu', teamId: teamB },
    ]).returning();
    await db.insert(playersToTeams).values([{ playerId: onA.id, teamId: teamA }, { playerId: onB.id, teamId: teamB }]);

    // Unassigned players reach the club scope through a club user's email.
    for (const first of ['Cristi', 'Dana']) {
        const email = `${first.toLowerCase()}@test.ro`;
        await db.insert(users).values({ email, name: first, clubId, role: 'player', status: 'active' });
        await db.insert(players).values({ name: first, firstName: first, lastName: 'Neasignat', email });
    }
});

after(closeDb);

test('excludeTeamId drops the target team members, keeps everyone else', async () => {
    const body = await browse({ excludeTeamId: String(teamA) });
    assert.deepEqual(names(body), ['Bogdan', 'Cristi', 'Dana']);
    assert.equal(body.total, 3);
    assert.deepEqual(body.items.find((item) => item.firstName === 'Bogdan')!.teamNames, ['U14']);
});

test('unassigned=1 returns only players on no team', async () => {
    const body = await browse({ unassigned: '1', excludeTeamId: String(teamA) });
    assert.deepEqual(names(body), ['Cristi', 'Dana']);
    assert.equal(body.total, 2);
});

test('query filters by name and total follows the filter', async () => {
    const body = await browse({ query: 'dan', excludeTeamId: String(teamA) });
    assert.deepEqual(names(body), ['Bogdan', 'Dana']);
    assert.equal(body.total, 2);
});

test('limit/offset page through with hasMore', async () => {
    const first = await browse({ limit: '2', offset: '0' });
    const second = await browse({ limit: '2', offset: '2' });
    assert.equal(first.total, 4);
    assert.equal(first.hasMore, true);
    assert.equal(second.hasMore, false);
    assert.equal(new Set([...names(first), ...names(second)]).size, 4);
});
