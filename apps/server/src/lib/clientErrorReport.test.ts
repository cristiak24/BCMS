import { test } from 'node:test';
import assert from 'node:assert/strict';
import { coarseUserAgent, createClientErrorDeduper, formatClientError, parseClientError, scrubText } from './clientErrorReport';

test('scrubText masks tokens, emails, phone numbers, keys and URL queries', () => {
    const text = scrubText(
        'Failed for ana.pop@gmail.com (0722 123 456) with Bearer abc.def-ghi at https://bcms.ro/invite?token=s3cr3t#x '
        + 'jwt eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1c2VyIn0.sig_part sk_live_1234567890abcdef user_2abcDEF123456789 '
        + 'k3v9QxR2mT8pW1nZ4yH7bL0cD5fG6jK2sA',
    );
    for (const leaked of ['ana.pop', '0722', 'abc.def', 's3cr3t', 'eyJ', 'sk_live', 'user_2abc', 'k3v9QxR2']) {
        assert.ok(!text.includes(leaked), `${leaked} leaked: ${text}`);
    }
    assert.match(text, /\[email\]/);
    assert.match(text, /\[number\]/);
    assert.match(text, /Bearer \[token\]/);
    assert.match(text, /https:\/\/bcms\.ro\/invite /);
});

test('scrubText keeps what debugging needs: line:col, short ids, paths', () => {
    assert.equal(scrubText('at render (https://bcms.ro/assets/index-Ab12.js:1:23456)'), 'at render (https://bcms.ro/assets/index-Ab12.js:1:23456)');
    assert.equal(scrubText("Cannot read properties of undefined (reading 'default')"), "Cannot read properties of undefined (reading 'default')");
});

test('parseClientError: clips, validates and drops what is not a report', () => {
    assert.equal(parseClientError(null), null);
    assert.equal(parseClientError([]), null);
    assert.equal(parseClientError({ kind: 'other', message: 'x' }), null);
    assert.equal(parseClientError({ kind: 'error', message: '   ' }), null);

    const report = parseClientError({
        kind: 'error',
        message: 'Boom '.repeat(1000),
        source: 'https://bcms.ro/assets/app.js?v=1&token=abc',
        line: 12, col: 'nope',
        stack: Array.from({ length: 40 }, (_, i) => `frame ${i}`).join('\n'),
        path: '/reset-password?token=abc#frag',
        build: 'not valid build id!',
    });
    assert.ok(report);
    assert.equal(report.message.length, 300);
    assert.equal(report.source, 'https://bcms.ro/assets/app.js');
    assert.equal(report.line, 12);
    assert.equal(report.col, null);
    assert.equal(report.stack.length, 8);
    assert.equal(report.path, '/reset-password');
    assert.equal(report.build, '');
});

test('coarseUserAgent keeps only browser family and platform', () => {
    const iphone = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
    assert.equal(coarseUserAgent(iphone), 'Safari/iOS');
    assert.equal(coarseUserAgent('Mozilla/5.0 (Linux; Android 14; SM-S911B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36'), 'Chrome/Android');
    assert.equal(coarseUserAgent(undefined), 'other/other');
});

test('the same error is logged once per window; a different one is logged', () => {
    const fresh = createClientErrorDeduper(1000);
    const a = parseClientError({ kind: 'error', message: 'Boom', source: 'https://bcms.ro/a.js', line: 1, col: 2 })!;
    const b = parseClientError({ kind: 'error', message: 'Boom', source: 'https://bcms.ro/a.js', line: 9, col: 2 })!;
    assert.equal(fresh(a, 0), true);
    assert.equal(fresh(a, 500), false);
    assert.equal(fresh(b, 500), true);
    assert.equal(fresh(a, 1500), true);
});

test('formatClientError: one [client-error] line with indented frames', () => {
    const report = parseClientError({ kind: 'boundary', message: 'Boom', path: '/admin/dashboard', stack: ['at A', 'at B'], build: 'abc123' })!;
    assert.equal(
        formatClientError(report, { role: 'admin', ua: 'Chrome/macOS' }),
        '[client-error] boundary /admin/dashboard "Boom" build=abc123 role=admin ua=Chrome/macOS\n    at A\n    at B',
    );
});

test('control characters cannot forge log lines', () => {
    assert.equal(scrubText('a\u0000b\u001b[31mc\rd\n[client-error] fake'), 'a b [31mc d [client-error] fake');
});
