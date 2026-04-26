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
  // Dacă folosești Supabase sau alt provider, ar putea fi nevoie de ssl: true
  // ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : undefined,
});

export const db = drizzle(pool, { schema });
