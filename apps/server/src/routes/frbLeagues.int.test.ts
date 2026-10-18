import '../test/pgliteEnv';
import { bearer } from '../test/fakeClerk';
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { db } from '../db';
import { clubs, users } from '../db/schema';
import { closeDb, createSchema } from '../test/pgliteDb';
import { serve } from '../test/serve';
import basketballRoutes from './basketball';

/**
 * The FRB proxy (audit WP6A, E): the children's leagues are listed, and bad
 * parameters are refused before anything is sent upstream (no network here).
 */

let server: Awaited<ReturnType<typeof serve>>;
const COACH = 'coach@club.ro';
const call = (url: string) => server.call('GET', `/api${url}`, { auth: bearer(`test_${COACH}`, COACH) });

before(async () => {
    await createSchema();
    const [club] = await db.insert(clubs).values({ name: 'Club Test', normalizedName: 'club test' }).returning();
    await db.insert(users).values({ email: COACH, name: 'Andrei Antrenor', role: 'coach', status: 'active', clubId: club.id });
    server = await serve({ '/api/basketball': basketballRoutes });
});

after(async () => {
    await server?.close();
    await closeDb();
});

test("the FRB league list has the children's leagues, boys and girls", async () => {
    const res = await call('/basketball/leagues');
    assert.equal(res.status, 200);
    const names = (res.body as Array<{ name: string }>).map((league) => league.name);
    for (const name of ['U12 Masculin', 'U12 Feminin', 'U13 Masculin', 'U15 Feminin', 'U20 Masculin', 'U14 Feminin']) {
        assert.ok(names.includes(name), `${name} is listed`);
    }
    const ids = (res.body as Array<{ id: string }>).map((league) => league.id);
    assert.equal(new Set(ids).size, ids.length, 'no league twice');
});

test('FRB proxy parameters that are not numeric ids are a 400, not an empty 200', async () => {
    for (const url of [
        '/basketball/standings?seasonId=abc&leagueId=8346',
        '/basketball/standings?seasonId=133478&leagueId=8346%26x%3D1',
        '/basketball/standings?seasonId=133478',
        '/basketball/seasons?leagueId=-1',
        '/basketball/teams?leagueId=8346&seasonId=1.5',
        '/basketball/matches?teamId=x&seasonId=1&leagueId=1',
        '/basketball/matches?teamId=1&seasonId=1&leagueId=1&month=octombrie',
        '/basketball/game?gameId=1&seasonId=',
    ]) {
        const res = await call(url);
        assert.equal(res.status, 400, url);
    }
});
