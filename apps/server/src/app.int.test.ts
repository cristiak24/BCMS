import './test/pgliteEnv';
import { bearer } from './test/fakeClerk';
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import type { AddressInfo } from 'net';
import type { Server } from 'http';
import { closeDb, createSchema } from './test/pgliteDb';
import { createServerApp } from './app';

/** P1-6 / R3-22 from the 2026-10-15 audit, on the real app. */

let server: Server;
let base = '';

before(async () => {
    await createSchema();
    server = await new Promise<Server>((resolve) => {
        const listening = createServerApp().listen(0, () => resolve(listening));
    });
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

after(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await closeDb();
});

test('API answers carry security headers and no framework fingerprint', async () => {
    const response = await fetch(`${base}/api/nope`);
    assert.equal(response.status, 404);
    assert.equal(response.headers.get('x-powered-by'), null);
    assert.match(response.headers.get('strict-transport-security') ?? '', /max-age=31536000/);
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(response.headers.get('x-frame-options'), 'DENY');
    assert.match(response.headers.get('content-security-policy') ?? '', /default-src 'none'/);
});

test('served files keep their own policy (inline PDFs must still open)', async () => {
    const response = await fetch(`${base}/api/files/not-a-key`);
    assert.equal(response.headers.get('content-security-policy'), null);
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
});

test('dead code is gone: no /uploads static folder, no fake password endpoint', async () => {
    // Whatever sits in the server's old uploads folder is no longer public.
    const dir = path.join(__dirname, '../uploads');
    const existed = fs.existsSync(dir);
    const probe = path.join(dir, `probe-${process.pid}.txt`);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(probe, 'private');
    try {
        const uploads = await fetch(`${base}/uploads/${path.basename(probe)}`);
        assert.equal(uploads.status, 404);
    } finally {
        fs.rmSync(existed ? probe : dir, { recursive: true, force: true });
    }
    const password = await fetch(`${base}/api/profile/me/password`, {
        method: 'POST',
        headers: { authorization: bearer('user_x', 'x@club.ro'), 'content-type': 'application/json' },
        body: '{}',
    });
    assert.equal(password.status, 404);
});
