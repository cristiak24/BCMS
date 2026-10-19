/**
 * The E2E API: the real apps/server app on a throwaway PGlite database, with
 * ONE substitution — lib/clerkAuth.ts is resolved to ./fakeClerk.ts, so a
 * Bearer `test:<email>` signs in as that verified email. Nothing in
 * apps/server knows about this file.
 *
 *   tsx e2e/support/server/start.ts   (started by e2e/playwright.config.ts)
 *
 * Runs in UTC, like Render: the timezone bugs of the audit only show there.
 */
import fs from 'node:fs';
import path from 'node:path';
import Module from 'node:module';
import { execFileSync } from 'node:child_process';
import { E2E } from '../env';

if (new Date().getTimezoneOffset() !== 0) {
    throw new Error('The E2E API must run with TZ=UTC (as on Render).');
}

const repo = path.resolve(__dirname, '../../..');
const serverDir = path.join(repo, 'apps/server');
const dbDir = path.join(E2E.stateDir, 'pg');

const env: Record<string, string | undefined> = {
    NODE_ENV: 'test', // db/index.ts then refuses anything but PGlite
    DATABASE_URL: `pglite:${dbDir}`,
    DB_ENVIRONMENT: 'development',
    CLERK_SECRET_KEY: 'sk_test_e2e_not_used',
    RESEND_API_KEY: '',
    STRIPE_SECRET_KEY: '',
    CORS_ORIGINS: E2E.webUrl,
    APP_BASE_URL: E2E.webUrl,
};
for (const [key, value] of Object.entries(env)) process.env[key] = value;
// The seed would make these accounts the club's staff instead of *@local.test.
for (const key of ['LOCAL_ADMIN_EMAIL', 'LOCAL_COACH_EMAIL', 'LOCAL_ACCOUNTANT_EMAIL', 'LOCAL_PARENT_EMAIL']) delete process.env[key];

// 1. Base club from the local-development seed (its own process: it opens
//    and closes the database; PGlite allows one process per folder).
fs.rmSync(dbDir, { recursive: true, force: true });
execFileSync(process.execPath, [require.resolve('tsx/cli'), 'src/scripts/localDb.ts'], {
    cwd: serverDir,
    env: process.env,
    stdio: ['ignore', 'ignore', 'inherit'],
});

// 2. Clerk → fake, before anything loads the real module.
const realClerk = fs.realpathSync(path.join(serverDir, 'src/lib/clerkAuth.ts'));
const fakeClerk = path.join(__dirname, 'fakeClerk.ts');
type Resolve = (request: string, parent: unknown, ...rest: unknown[]) => string;
const moduleWithResolve = Module as unknown as { _resolveFilename: Resolve };
const resolveFilename = moduleWithResolve._resolveFilename;
moduleWithResolve._resolveFilename = function (request, parent, ...rest) {
    const resolved = resolveFilename.call(this, request, parent, ...rest);
    try {
        return fs.realpathSync(resolved) === realClerk ? fakeClerk : resolved;
    } catch {
        return resolved;
    }
};

async function main() {
    // 3. E2E data on top, then the app itself on the same connection.
    const { seedE2E } = require('./seed') as typeof import('./seed');
    const ids = await seedE2E();
    fs.writeFileSync(E2E.seedFile, JSON.stringify(ids, null, 2));

    const { app } = require(path.join(serverDir, 'src/app')) as typeof import('../../../apps/server/src/app');
    const server = app.listen(E2E.apiPort, '127.0.0.1', () => {
        console.log(`[e2e api] ${E2E.apiUrl} on ${dbDir}`);
    });
    const stop = () => server.close(() => process.exit(0));
    process.on('SIGTERM', stop);
    process.on('SIGINT', stop);
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
