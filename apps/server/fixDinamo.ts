import { db } from './src/db';
import { teams, events } from './src/db/schema';
import { eq, like, and } from 'drizzle-orm';

async function fixDinamo() {
    console.log("Updating CS Dinamo Bucuresti...");
    
    // 1. Update the team to actually be the LNBM (National League) and the correct 25-26 season
    await db.update(teams)
       .set({
          frbLeagueId: '25493',
          frbSeasonId: '131194',
          leagueName: 'LNBM',
          seasonName: '2025-2026'
       })
       .where(like(teams.name, '%Dinamo Bucuresti%'));
       
    // 2. Clear out any previous Dinamo matches that were added under the Cupa Romaniei league so they don't corrupt the sync.
    const dinamoTeamRow = await db.select().from(teams).where(like(teams.name, '%Dinamo Bucuresti%')).limit(1);
    if(dinamoTeamRow.length > 0) {
        await db.delete(events).where(and(
           eq(events.teamId, dinamoTeamRow[0].id),
           eq(events.description, 'Synced from FRB')
        ));
    }
    console.log("Success! Updated to LNBM 25493 and Season 131194.");
    process.exit(0);
}
fixDinamo();
