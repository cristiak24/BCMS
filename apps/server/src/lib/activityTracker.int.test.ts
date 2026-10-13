import '../test/pgliteEnv';
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { eq } from 'drizzle-orm';
import { db } from '../db';
import { clubs, userActivityMonths, users } from '../db/schema';
import { closeDb, createSchema } from '../test/pgliteDb';
import { writeActivity } from './activityTracker';

/** The monthly activity upsert that platform billing counts. */

let userId = 0;
let clubId = 0;

before(async () => {
    await createSchema();
    const [club] = await db.insert(clubs).values({ name: 'Club Activ', normalizedName: 'club activ' }).returning();
    clubId = club.id;
    const [user] = await db.insert(users).values({ email: 'p@club.ro', name: 'Părinte', role: 'parent', status: 'active', clubId }).returning();
    userId = user.id;
});

after(async () => {
    await closeDb();
});

test('one row per account per month; active days count distinct days', async () => {
    const user = { id: userId, clubId, role: 'parent' };
    await writeActivity(user, new Date('2026-10-05T08:00:00Z'));
    await writeActivity(user, new Date('2026-10-05T15:00:00Z')); // same day
    await writeActivity(user, new Date('2026-10-07T09:00:00Z'));
    await writeActivity(user, new Date('2026-11-02T09:00:00Z')); // next month

    const rows = await db.select().from(userActivityMonths).where(eq(userActivityMonths.userId, userId)).orderBy(userActivityMonths.month);
    assert.equal(rows.length, 2);
    assert.equal(rows[0].month, '2026-10');
    assert.equal(rows[0].activeDays, 2);
    assert.equal(rows[0].lastSeenDay, '2026-10-07');
    assert.equal(rows[0].clubId, clubId);
    assert.equal(rows[1].month, '2026-11');
    assert.equal(rows[1].activeDays, 1);

    const [account] = await db.select().from(users).where(eq(users.id, userId));
    assert.ok(account.lastLoginAt, 'last activity is stamped on the account');
});
