import fs from 'node:fs';
import { E2E } from './env';

/** Drop the throwaway database and client build (E2E_KEEP_STATE=1 keeps them). */
export default function globalTeardown() {
  if (process.env.E2E_KEEP_STATE === '1') {
    console.log(`[e2e] state kept in ${E2E.stateDir}`);
    return;
  }
  fs.rmSync(E2E.stateDir, { recursive: true, force: true });
}
