import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clientIp, rateLimit } from './rateLimit';

function run(limiter: ReturnType<typeof rateLimit>, req: any) {
    let status = 200;
    const res: any = { setHeader() {}, status(code: number) { status = code; return this; }, json() { return this; } };
    limiter(req, res, () => {});
    return status;
}

test('client IP comes from Cloudflare, not from the proxy in front of the app', () => {
    assert.equal(clientIp({ headers: { 'cf-connecting-ip': '86.120.4.9' }, ip: '10.0.0.5' }), '86.120.4.9');
    assert.equal(clientIp({ headers: { 'cf-connecting-ip': '2a02:2f0e::1' }, ip: '10.0.0.5' }), '2a02:2f0e::1');
    assert.equal(clientIp({ headers: { 'cf-connecting-ip': 'not an ip' }, ip: '10.0.0.5' }), '10.0.0.5');
    assert.equal(clientIp({ headers: {} }), 'unknown');
});

test('people behind the same proxy get separate buckets; a custom key overrides the IP', () => {
    const byIp = rateLimit({ bucket: 'test:ip', limit: 1, windowMs: 60_000 });
    const a = { headers: { 'cf-connecting-ip': '1.1.1.1' }, ip: '10.0.0.5' };
    const b = { headers: { 'cf-connecting-ip': '2.2.2.2' }, ip: '10.0.0.5' };
    assert.equal(run(byIp, a), 200);
    assert.equal(run(byIp, a), 429);
    assert.equal(run(byIp, b), 200);

    const byUid = rateLimit({ bucket: 'test:uid', limit: 1, windowMs: 60_000, key: (req) => `uid:${(req as any).uid}` });
    assert.equal(run(byUid, { ...a, uid: 'x' }), 200);
    assert.equal(run(byUid, { ...a, uid: 'y' }), 200);
    assert.equal(run(byUid, { ...a, uid: 'x' }), 429);
});
