import { test } from 'node:test';
import { strict as assert } from 'node:assert';

import { createViolationDeduper, parseCspReports } from './cspReport';

test('both report formats are read, without query strings', () => {
  const legacy = parseCspReports({ 'csp-report': {
    'document-uri': 'https://bcms.ro/admin/finance?token=secret',
    'violated-directive': 'script-src-elem',
    'effective-directive': 'script-src-elem',
    'blocked-uri': 'https://evil.example/x.js?k=1',
  } });
  assert.deepEqual(legacy, [{ directive: 'script-src-elem', blocked: 'https://evil.example/x.js', page: 'https://bcms.ro/admin/finance' }]);

  const modern = parseCspReports([{ type: 'csp-violation', body: { documentURL: 'https://bcms.ro/', effectiveDirective: 'connect-src', blockedURL: 'https://api.example/v1' } }, { type: 'deprecation', body: {} }]);
  assert.deepEqual(modern, [{ directive: 'connect-src', blocked: 'https://api.example/v1', page: 'https://bcms.ro/' }]);
  assert.deepEqual(parseCspReports('nonsense'), []);
});

test('a violation is logged once per hour', () => {
  const fresh = createViolationDeduper(60_000);
  const v = { directive: 'img-src', blocked: 'https://x.example/a.png', page: 'https://bcms.ro/' };
  assert.equal(fresh(v, 0), true);
  assert.equal(fresh(v, 30_000), false);
  assert.equal(fresh(v, 61_000), true);
});
