import '../test/pgliteEnv';
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { sql } from 'drizzle-orm';
import { db } from '../db';
import { closeDb } from '../test/pgliteDb';
import { clientErrorMessage, GENERIC_ERROR, isInternalError, sendRouteError } from './httpErrors';

after(async () => {
    await closeDb();
});

function fakeResponse() {
    const sent: { status?: number; body?: any } = {};
    const res = {
        status(code: number) { sent.status = code; return res; },
        json(body: unknown) { sent.body = body; return res; },
    };
    return { res: res as never, sent };
}

async function realQueryError() {
    try {
        await db.execute(sql`insert into "no_such_table" ("amount") values (${99999999999})`);
    } catch (error) {
        return error;
    }
    throw new Error('the query should have failed');
}

test('a failing query never reaches the client, whatever status the route picked', async () => {
    const error = await realQueryError();
    assert.equal(isInternalError(error), true);
    assert.equal(clientErrorMessage(error, 'Nu am putut salva.'), 'Nu am putut salva.');

    const quiet = console.error;
    console.error = () => undefined;
    try {
        for (const status of [400, 500]) {
            const { res, sent } = fakeResponse();
            sendRouteError(res, error, { status, fallback: 'Nu am putut salva.' });
            assert.equal(sent.status, 500);
            assert.equal(sent.body.error, GENERIC_ERROR);
            assert.doesNotMatch(JSON.stringify(sent.body), /no_such_table|insert|params/i);
        }
    } finally {
        console.error = quiet;
    }
});

test('a message thrown on purpose is still shown on a 4xx', () => {
    const error = new Error('Invitația a expirat.');
    assert.equal(isInternalError(error), false);
    assert.equal(clientErrorMessage(error, 'x'), 'Invitația a expirat.');
    assert.equal(isInternalError(new TypeError("Cannot read properties of undefined (reading 'id')")), true);
    assert.equal(isInternalError(Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' })), true);
    assert.equal(isInternalError('boom'), true);
});
