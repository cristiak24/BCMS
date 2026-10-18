/**
 * E2E suite: `npm run test:e2e` (root). Starts two throwaway servers:
 *  - the real API on a fresh PGlite database in UTC, Clerk swapped for a fake
 *    (support/server/start.ts);
 *  - the real client built with an auth mock instead of Clerk, served like
 *    Cloudflare serves production (support/client/serve.ts).
 * The Clerk bypass lives only in e2e/ (specs/00-izolare checks that).
 * Browser in Europe/Bucharest, Romanian locale. Specs share one database and
 * run in order (one worker); each creates or picks its own data.
 *
 * While writing tests: start both servers once (same E2E_STATE_DIR), then run
 * with E2E_REUSE=1 E2E_KEEP_STATE=1 to skip the restart and keep the data.
 */
import os from 'node:os';
import path from 'node:path';
import { defineConfig, devices } from '@playwright/test';
import { E2E } from './support/env';

const repo = path.resolve(__dirname, '..');
const outputDir = process.env.E2E_OUTPUT_DIR
  ? path.resolve(repo, process.env.E2E_OUTPUT_DIR)
  : path.join(os.tmpdir(), 'bcms-e2e-results');
const serverEnv = { ...process.env, E2E_STATE_DIR: E2E.stateDir } as Record<string, string>;

export default defineConfig({
  testDir: './specs',
  outputDir,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: !!process.env.CI,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI
    ? [['list'], ['html', { outputFolder: path.join(outputDir, 'report'), open: 'never' }]]
    : [['list']],
  globalTeardown: './support/global-teardown.ts',
  use: {
    ...devices['Desktop Chrome'],
    baseURL: E2E.webUrl,
    timezoneId: 'Europe/Bucharest',
    locale: 'ro-RO',
    serviceWorkers: 'block',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: [
    {
      command: 'npx tsx e2e/support/server/start.ts',
      cwd: repo,
      url: `${E2E.apiUrl.replace(/\/api$/, '')}/`,
      env: { ...serverEnv, TZ: 'UTC' },
      reuseExistingServer: process.env.E2E_REUSE === '1',
      timeout: 120_000,
      stdout: 'ignore',
      stderr: 'pipe',
    },
    {
      command: 'npx tsx e2e/support/client/serve.ts',
      cwd: repo,
      url: E2E.webUrl,
      env: serverEnv,
      reuseExistingServer: process.env.E2E_REUSE === '1',
      timeout: 180_000,
      stdout: 'pipe',
      stderr: 'pipe',
    },
  ],
});
