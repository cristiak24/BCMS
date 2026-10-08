import { pushSchema } from 'drizzle-kit/api';
import * as schema from '../db/schema';
import { db, pglite } from '../db';

/** Create every table of the app's schema in the in-memory database. */
export async function createSchema() {
    const { apply } = await pushSchema(schema as unknown as Record<string, unknown>, db as never);
    await apply();
}

export async function closeDb() {
    await pglite?.close();
}
