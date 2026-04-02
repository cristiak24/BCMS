import { db } from './src/db';
import { events } from './src/db/schema';
import { eq } from 'drizzle-orm';

async function checkEvents() {
  const allEvents = await db.select().from(events).where(eq(events.description, 'Synced from FRB'));
  console.log(`Found ${allEvents.length} synced events in database.`);
  if (allEvents.length > 0) {
      console.log('Sample event dates:');
      for (let i = 0; i < Math.min(5, allEvents.length); i++) {
          console.log(`- ${allEvents[i].title} : ${allEvents[i].startTime?.toISOString()}`);
      }
  }
  process.exit(0);
}
checkEvents();
