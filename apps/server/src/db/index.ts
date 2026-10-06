import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';
import { loadServerEnv } from '../lib/loadEnv';

loadServerEnv();

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.warn('⚠️  DATABASE_URL environment variable is missing.');
}

export const pool = new Pool({
  connectionString,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : undefined,
  // pg's default closes idle connections after 10s, so a user coming back
  // after a short pause paid a fresh TCP + TLS + auth handshake to Neon on
  // their first query. Keep warm connections around longer.
  idleTimeoutMillis: 5 * 60 * 1000,
  keepAlive: true,
});

export const db = drizzle(pool, { schema });
