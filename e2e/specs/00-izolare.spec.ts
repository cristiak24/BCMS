/**
 * The Clerk bypass must never reach the app: nothing under apps/ imports from
 * e2e/, and the production build (the app's own Vite config) contains no trace
 * of the auth mock — while the E2E build does (so the check can see it).
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test, expect } from '@playwright/test';
import { E2E } from '../support/env';

const repo = path.resolve(__dirname, '../..');
const MARKERS = ['bcms-e2e-auth-mock', 'bcms.e2e.as'];
/** A string only the real, Clerk-backed context/AuthContext.tsx has. */
const REAL_AUTH = 'Clerk session is no longer valid.';

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (['node_modules', 'dist', '.pglite'].includes(entry.name)) return [];
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return /\.(c|m)?[jt]sx?$/.test(entry.name) ? [full] : [];
  });
}

function bundleText(dir: string) {
  return fs.readdirSync(path.join(dir, 'assets'))
    .filter((name) => name.endsWith('.js'))
    .map((name) => fs.readFileSync(path.join(dir, 'assets', name), 'utf8'))
    .join('\n');
}

test('apps/server and apps/client never import from e2e/', () => {
  const offenders = [
    ...sourceFiles(path.join(repo, 'apps/server/src')),
    ...sourceFiles(path.join(repo, 'apps/client')),
  ].filter((file) => /(from\s+|require\(|import\()\s*['"][^'"]*\/e2e\//.test(fs.readFileSync(file, 'utf8')));
  expect(offenders.map((file) => path.relative(repo, file))).toEqual([]);
});

test('the production build contains no auth mock; the E2E build does', () => {
  test.setTimeout(180_000);
  const e2eBundle = bundleText(path.join(E2E.stateDir, 'web'));
  for (const marker of MARKERS) expect(e2eBundle, `E2E build should contain ${marker}`).toContain(marker);
  expect(e2eBundle).not.toContain(REAL_AUTH);

  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bcms-prod-build-'));
  try {
    execFileSync(process.execPath, [path.join(repo, 'apps/client/node_modules/vite/bin/vite.js'), 'build', '--outDir', outDir, '--emptyOutDir', '--logLevel', 'error'], {
      cwd: path.join(repo, 'apps/client'),
      stdio: ['ignore', 'ignore', 'inherit'],
    });
    const production = bundleText(outDir);
    expect(production.length).toBeGreaterThan(100_000);
    for (const marker of MARKERS) expect(production, `production build must not contain ${marker}`).not.toContain(marker);
    // The real AuthContext (Clerk) is what ships.
    expect(production).toContain(REAL_AUTH);
  } finally {
    fs.rmSync(outDir, { recursive: true, force: true });
  }
});
