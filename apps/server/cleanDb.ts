import { db } from './src/db';
import { events } from './src/db/schema';
import { eq } from 'drizzle-orm';

async function cleanup() {
  console.log('Deleting corrupted FRB sync matches...');
  const res = await db.delete(events).where(eq(events.description, 'Synced from FRB')).returning();
  console.log(`Deleted ${res.length} matches.`);
  process.exit(0);
}

cleanup();
