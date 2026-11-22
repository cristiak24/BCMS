import '../test/pgliteEnv';
import { bearer } from '../test/fakeClerk';
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { Router } from 'express';
import { db } from '../db';
import { clubs, users } from '../db/schema';
import { closeDb, createSchema } from '../test/pgliteDb';
import { serve } from '../test/serve';
import { clientErrorRoute } from './clientErrors';

/** Val 2: POST /api/client-errors logs browser crashes without a paid service. */

let api: Awaited<ReturnType<typeof serve>>;
const logged: string[] = [];
const originalWarn = console.warn;

before(async () => {
    await createSchema();
    const [club] = await db.insert(clubs).values({ name: 'Club Erori', normalizedName: 'club erori' }).returning();
    await db.insert(users).values({ email: 'coach.err@club.ro', name: 'Antrenor', role: 'coach', status: 'active', clubId: club.id, clerkUserId: 'user_err_coach' });
    api = await serve({ '/api/client-errors': Router().post('/', ...clientErrorRoute) });
    console.warn = (...args: unknown[]) => { logged.push(args.map(String).join(' ')); };
});

after(async () => {
    console.warn = originalWarn;
    await api.close();
    await closeDb();
});

const report = (message: string) => ({
    kind: 'error', message, source: 'https://bcms.ro/assets/index.js?x=1', line: 3, col: 7,
    stack: 'TypeError: x\n    at f (https://bcms.ro/assets/index.js:3:7)', path: '/join?code=SECRET', build: 'b1',
});

test('anonymous report: 204, logged once, scrubbed, no personal data', async () => {
    const first = await api.call('POST', '/api/client-errors', {
        body: report('Boom for ana@club.ro'),
        headers: { 'user-agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) Safari/604.1', 'cf-connecting-ip': '203.0.113.7' },
    });
    assert.equal(first.status, 204);
    const again = await api.call('POST', '/api/client-errors', { body: report('Boom for ana@club.ro'), headers: { 'cf-connecting-ip': '203.0.113.7' } });
    assert.equal(again.status, 204);
    const lines = logged.filter((line) => line.includes('Boom'));
    assert.equal(lines.length, 1, 'the repeat is not logged again');
    assert.match(lines[0], /^\[client-error\] error \/join "Boom for \[email\]" at https:\/\/bcms\.ro\/assets\/index\.js:3:7 build=b1 role=anon ua=Safari\/iOS/);
    assert.ok(!lines[0].includes('SECRET') && !lines[0].includes('x=1') && !lines[0].includes('203.0.113.7'));
});

test('a valid Bearer adds only the role; a bad one is ignored', async () => {
    const signed = await api.call('POST', '/api/client-errors', { auth: bearer('user_err_coach', 'coach.err@club.ro'), body: report('Coach crash'), headers: { 'cf-connecting-ip': '203.0.113.8' } });
    assert.equal(signed.status, 204);
    const bad = await api.call('POST', '/api/client-errors', { auth: 'Bearer garbage', body: report('Bad token crash'), headers: { 'cf-connecting-ip': '203.0.113.8' } });
    assert.equal(bad.status, 204);
    assert.match(logged.find((line) => line.includes('Coach crash')) ?? '', /role=coach /);
    const badLine = logged.find((line) => line.includes('Bad token crash')) ?? '';
    assert.match(badLine, /role=anon /);
    assert.ok(!logged.some((line) => line.includes('coach.err@club.ro') || line.includes('user_err_coach')));
});

test('an invalid payload is refused; the limit is per client IP', async () => {
    const invalid = await api.call('POST', '/api/client-errors', { body: { kind: 'nope' }, headers: { 'cf-connecting-ip': '203.0.113.9' } });
    assert.equal(invalid.status, 400);
    let status = 0;
    for (let i = 0; i < 21; i += 1) {
        status = (await api.call('POST', '/api/client-errors', { body: report(`flood ${i}`), headers: { 'cf-connecting-ip': '203.0.113.10' } })).status;
    }
    assert.equal(status, 429);
    const other = await api.call('POST', '/api/client-errors', { body: report('other ip'), headers: { 'cf-connecting-ip': '203.0.113.11' } });
    assert.equal(other.status, 204);
});
