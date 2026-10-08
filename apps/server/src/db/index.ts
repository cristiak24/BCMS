import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';
import { loadServerEnv } from '../lib/loadEnv';
import { checkDatabaseTarget } from '../lib/dbEnvironment';

loadServerEnv();

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.warn('⚠️  DATABASE_URL environment variable is missing.');
}

const target = checkDatabaseTarget(process.env);
if (target.level === 'block') {
  throw new Error(target.message);
}
if (target.level === 'warn') {
  console.warn(`\n⚠️  ${target.message}\n`);
}

/**
 * `DATABASE_URL=pglite:./.pglite` (or `pglite:memory`) runs on PGlite — real
 * Postgres embedded in Node — for local development and integration tests,
 * fully separate from the production database (audit BUG-015). Anything else
 * is a normal Postgres connection string (Neon in production).
 */
function createDatabase() {
  if (connectionString?.startsWith('pglite:')) {
    // Loaded only here: production never needs the embedded engine.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { PGlite } = require('@electric-sql/pglite') as typeof import('@electric-sql/pglite');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { drizzle: drizzlePglite } = require('drizzle-orm/pglite') as typeof import('drizzle-orm/pglite');
    const location = connectionString.slice('pglite:'.length);
    const client = new PGlite(location && location !== 'memory' ? location : undefined);
    // Same query builder API; typed as the production driver for the app code.
    return { db: drizzlePglite(client, { schema }) as unknown as NodePgDatabase<typeof schema>, pool: null as Pool | null, pglite: client };
  }

  const pgPool = new Pool({
    connectionString,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : undefined,
    // pg's default closes idle connections after 10s, so a user coming back
    // after a short pause paid a fresh TCP + TLS + auth handshake to Neon on
    // their first query. Keep warm connections around longer.
    idleTimeoutMillis: 5 * 60 * 1000,
    keepAlive: true,
  });
  return { db: drizzle(pgPool, { schema }), pool: pgPool as Pool | null, pglite: null };
}

const database = createDatabase();
export const db = database.db;
export const pool = database.pool;
/** The embedded engine when running on PGlite (tests close it), else null. */
export const pglite = database.pglite;
