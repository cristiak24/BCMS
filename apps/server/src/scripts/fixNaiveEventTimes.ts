/**
 * One-off data fix for audit P0-3 — DO NOT RUN ON NEON WITHOUT APPROVAL.
 *
 * Until the WP3 fix, the event form sent "2026-10-22T19:00:00" without a zone
 * and the server (UTC on Render) stored it as 19:00 UTC: the column holds the
 * Romanian wall clock instead of UTC, so the app shows 22:00. This script
 * re-reads those values as Europe/Bucharest time and stores the UTC instant
 * (DST-aware: 19:00 in October → 16:00, 19:00 in January → 17:00).
 *
 * Affected: every event created before the fix deploy except FRB-synced ones
 * (those were always converted correctly; their description mentions "FRB").
 * Duplicated events copied the wrong time, so they are included too.
 * Attendance rows store the session start in `date`; those move with it.
 *
 *   Dry run (default, read-only):
 *     DATABASE_URL=… npx tsx src/scripts/fixNaiveEventTimes.ts --cutoff=2026-10-17T10:00:00Z
 *   Apply (one transaction):
 *     DATABASE_URL=… npx tsx src/scripts/fixNaiveEventTimes.ts --cutoff=… --apply
 *
 * `--cutoff` = when the fixed client went live (UTC). Events created after it
 * are already correct and must not be shifted again. Run it ONCE: a second run
 * with the same cutoff would shift the same rows a second time.
 */
import { sql } from 'drizzle-orm';
import { db } from '../db';

const ZONE = 'Europe/Bucharest';

type Row = { id: number; title: string; start_time: string; end_time: string; new_start: string; new_end: string; created_at: string };

function arg(name: string) {
    const prefix = `--${name}=`;
    return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length) ?? null;
}

function rowsOf<T>(result: unknown): T[] {
    return ((result as { rows?: T[] }).rows ?? (result as T[])) as T[];
}

async function main() {
    const cutoffArg = arg('cutoff');
    const cutoff = cutoffArg ? new Date(cutoffArg) : null;
    if (!cutoff || Number.isNaN(cutoff.getTime()) || !/(Z|[+-]\d{2}:?\d{2})$/.test(cutoffArg ?? '')) {
        throw new Error('--cutoff=<ISO cu Z, momentul deploy-ului cu fix-ul> este obligatoriu.');
    }
    const apply = process.argv.includes('--apply');
    const cutoffUtc = cutoff.toISOString();

    const affected = sql`
        created_at < ${cutoffUtc}::timestamp
        AND (description IS NULL OR description !~* 'FRB')`;

    const preview = rowsOf<Row>(await db.execute(sql`
        SELECT id, title, start_time::text, end_time::text, created_at::text,
               ((start_time AT TIME ZONE ${ZONE}) AT TIME ZONE 'UTC')::text AS new_start,
               ((end_time AT TIME ZONE ${ZONE}) AT TIME ZONE 'UTC')::text AS new_end
        FROM events
        WHERE ${affected}
        ORDER BY id`));

    console.log(`${preview.length} evenimente create înainte de ${cutoffUtc} (fără FRB):`);
    for (const row of preview) {
        console.log(`  #${row.id} „${row.title}”  ${row.start_time} → ${row.new_start}  (creat ${row.created_at})`);
    }

    if (!apply) {
        console.log('\nDry run: nimic nu a fost modificat. Adaugă --apply după aprobare.');
        return;
    }

    const ids = preview.map((row) => row.id);
    if (!ids.length) return;
    const idList = sql.join(ids.map((id) => sql`${id}`), sql`, `);

    await db.transaction(async (tx) => {
        // Attendance first: it is matched on the event's *old* start.
        const attendance = await tx.execute(sql`
            UPDATE attendance a
            SET date = (a.date AT TIME ZONE ${ZONE}) AT TIME ZONE 'UTC'
            FROM events e
            WHERE a.event_id = e.id AND e.id IN (${idList}) AND a.date = e.start_time`);
        const updated = await tx.execute(sql`
            UPDATE events
            SET start_time = (start_time AT TIME ZONE ${ZONE}) AT TIME ZONE 'UTC',
                end_time = (end_time AT TIME ZONE ${ZONE}) AT TIME ZONE 'UTC'
            WHERE id IN (${idList})`);
        const count = (result: unknown) => (result as { rowCount?: number; affectedRows?: number }).rowCount
            ?? (result as { affectedRows?: number }).affectedRows ?? '?';
        console.log(`\nAplicat: ${count(updated)} evenimente, ${count(attendance)} rânduri de prezență.`);
    });
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error instanceof Error ? error.message : error);
        process.exit(1);
    });
