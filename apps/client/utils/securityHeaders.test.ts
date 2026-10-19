import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';

/** P1-6: bcms.ro had no HSTS and no CSP (public/_headers → Cloudflare). */

const root = path.join(__dirname, '..');
const headers = readFileSync(path.join(root, 'public/_headers'), 'utf8');

function siteHeader(name: string) {
  const block = headers.split(/\n(?=\/)/).find((section) => section.startsWith('/*\n'));
  const line = block?.split('\n').find((row) => row.trim().toLowerCase().startsWith(`${name.toLowerCase()}:`));
  return line ? line.slice(line.indexOf(':') + 1).trim() : null;
}

test('every page is served with HSTS and an enforced CSP', () => {
  assert.match(siteHeader('Strict-Transport-Security') ?? '', /max-age=31536000/);
  const csp = siteHeader('Content-Security-Policy') ?? '';
  assert.match(csp, /frame-ancestors 'none'/);
  assert.match(csp, /object-src 'none'/);
  assert.match(csp, /base-uri 'self'/);
});

test('the report-only policy allows the inline theme script by its hash', () => {
  const html = readFileSync(path.join(root, 'index.html'), 'utf8');
  const inline = /<script>([\s\S]*?)<\/script>/.exec(html)?.[1];
  assert.ok(inline, 'index.html has an inline script');
  const hash = createHash('sha256').update(inline).digest('base64');
  assert.ok((siteHeader('Content-Security-Policy-Report-Only') ?? '').includes(`'sha256-${hash}'`));
});

test('report-only violations are sent to the API, so they can be read before enforcing (WP7-G3)', () => {
  const policy = siteHeader('Content-Security-Policy-Report-Only') ?? '';
  assert.match(policy, /report-uri https:\/\/bcms-qflv\.onrender\.com\/api\/csp-report/);
  // The enforced policy stays the minimal one until the report-only one is clean.
  assert.doesNotMatch(siteHeader('Content-Security-Policy') ?? '', /default-src/);
});
