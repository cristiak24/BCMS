/**
 * Where the E2E servers listen and where their throwaway state lives. The
 * state folder (PGlite database, client build, seed ids) is created once in
 * the OS temp dir by the Playwright main process and inherited by the
 * servers and workers through E2E_STATE_DIR; global-teardown deletes it.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

if (!process.env.E2E_STATE_DIR) {
  process.env.E2E_STATE_DIR = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'bcms-e2e-')));
}

const apiPort = Number(process.env.E2E_API_PORT || 4790);
const webPort = Number(process.env.E2E_WEB_PORT || 8790);

export const E2E = {
  stateDir: process.env.E2E_STATE_DIR,
  apiPort,
  webPort,
  apiUrl: `http://127.0.0.1:${apiPort}/api`,
  webUrl: `http://127.0.0.1:${webPort}`,
  /** Written by the API runner after seeding: ids the specs need. */
  seedFile: path.join(process.env.E2E_STATE_DIR, 'seed.json'),
};
