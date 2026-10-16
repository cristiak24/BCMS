/**
 * Re-allocate desk payments recorded before payments were split by amount
 * (audit P0-2): back then any desk payment settled every fee it listed in
 * full, so 5 RON could clear a 150 RON fee. This replays each player's desk
 * payments, oldest first, through planPayment() — the rule the app now uses —
 * and rewrites fee_ids where the split differs. Request rows ("payment:17")
 * such a payment voided but no longer covers go back to 'pending'.
 *
 *   DATABASE_URL=… npx tsx src/scripts/repairPartialPayments.ts            # dry run: prints the changes
 *   DATABASE_URL=… npx tsx src/scripts/repairPartialPayments.ts --apply    # writes them, in one transaction
 *
 * Stripe rows are left alone (they charged exactly the fees they list), as
 * are rows without fee ids (legacy: they settle their own month). Fee
 * amounts come from today's club settings — the app keeps no history of
 * them — so review the dry run where a club changed its fees since.
 */
import { and, asc, eq, inArray, isNotNull, isNull } from 'drizzle-orm';
import { db, pglite, pool } from '../db';
import { playerPayments, players, playersToTeams, teams } from '../db/schema';
import { planPayment, type LedgerRow } from '../lib/feeSchedule';
import { collectSettlements, isPaidStatus, parseAllocationToken, parseFeeIds, serializeFeeIds } from '../lib/paymentLedger';
import { playerFees } from '../services/clubFinance';

type PaymentRow = typeof playerPayments.$inferSelect;

export type Repair = {
    paymentId: number;
    playerId: number;
    amount: number;
    before: string | null;
    after: string | null;
};

/** A desk payment written before allocation: paid, not Stripe, plain fee ids only. */
function isOldDeskPayment(row: PaymentRow) {
    const tokens = parseFeeIds(row.feeIds);
    return isPaidStatus(row.status) && !row.stripeSessionId && tokens.length > 0
        && tokens.every((token) => parseAllocationToken(token).amount == null);
}

/** The club whose fee settings bill the player (legacy team_id, then memberships). */
async function clubIdOf(player: typeof players.$inferSelect) {
    const memberships = await db.select({ teamId: playersToTeams.teamId }).from(playersToTeams).where(eq(playersToTeams.playerId, player.id));
    const teamIds = [player.teamId, ...memberships.map((row) => row.teamId)].filter((id): id is number => id != null);
    if (!teamIds.length) return null;
    const [team] = await db.select({ clubId: teams.clubId }).from(teams).where(inArray(teams.id, teamIds)).limit(1);
    return team?.clubId ?? null;
}

function requestId(feeId: string) {
    const id = feeId.startsWith('payment:') ? Number(feeId.slice('payment:'.length)) : NaN;
    return Number.isInteger(id) && id > 0 ? id : null;
}

export type PlayerRepair = { repairs: Repair[]; reopenRequests: number[] };

async function repairsForPlayer(player: typeof players.$inferSelect): Promise<PlayerRepair> {
    const { input, rows } = await playerFees(player, await clubIdOf(player));
    const ordered = [...rows].sort((a, b) => String(a.date ?? a.createdAt ?? '').localeCompare(String(b.date ?? b.createdAt ?? '')) || a.id - b.id);
    const suspects = ordered.filter(isOldDeskPayment);
    if (!suspects.length) return { repairs: [], reopenRequests: [] };

    // Club requests an old desk payment voided are open again for the replay;
    // they end up settled only if the money really covers them.
    const listedRequests = new Set(suspects.flatMap((row) => parseFeeIds(row.feeIds)).map(requestId).filter((id): id is number => id != null));
    const suspectIds = new Set(suspects.map((row) => row.id));
    const ledger: LedgerRow[] = input.rows
        .filter((row) => !suspectIds.has(row.id))
        .map((row) => (listedRequests.has(row.id) && row.status === 'void' ? { ...row, status: 'pending' } : row));

    // Replay the old desk payments one by one, oldest first.
    const repairs: Repair[] = [];
    for (const row of suspects) {
        const plan = planPayment({ ...input, rows: ledger }, Number(row.amount) || 0, parseFeeIds(row.feeIds));
        const after = serializeFeeIds(plan.tokens);
        if (after !== row.feeIds) {
            repairs.push({ paymentId: row.id, playerId: row.playerId, amount: Number(row.amount) || 0, before: row.feeIds, after });
        }
        ledger.push({ id: row.id, status: row.status, feeIds: after, month: row.month, year: row.year, amount: row.amount });
    }

    const settled = collectSettlements(ledger).settled;
    const reopenRequests = rows
        .filter((row) => listedRequests.has(row.id) && row.status === 'void' && !settled.has(`payment:${row.id}`))
        .map((row) => row.id);
    return { repairs, reopenRequests };
}

async function main() {
    const apply = process.argv.includes('--apply');
    const candidates = await db
        .selectDistinct({ playerId: playerPayments.playerId })
        .from(playerPayments)
        .where(and(isNull(playerPayments.stripeSessionId), isNotNull(playerPayments.feeIds)));
    const ids = candidates.map((row) => row.playerId);
    const playerRows = ids.length ? await db.select().from(players).where(inArray(players.id, ids)).orderBy(asc(players.id)) : [];

    const repairs: Repair[] = [];
    const reopen: number[] = [];
    for (const player of playerRows) {
        const result = await repairsForPlayer(player);
        repairs.push(...result.repairs);
        reopen.push(...result.reopenRequests);
    }

    for (const repair of repairs) {
        console.log(`plata #${repair.paymentId} (jucător ${repair.playerId}, ${repair.amount} RON): ${repair.before} → ${repair.after}`);
    }
    if (reopen.length) console.log(`cereri de plată redeschise (void → pending): ${reopen.join(', ')}`);
    console.log(`${repairs.length} plăți de corectat, ${reopen.length} cereri de redeschis${apply ? '' : ' (dry run — nimic scris; rulează cu --apply)'}.`);

    if (apply && (repairs.length || reopen.length)) {
        await db.transaction(async (tx) => {
            for (const repair of repairs) {
                await tx.update(playerPayments).set({ feeIds: repair.after }).where(eq(playerPayments.id, repair.paymentId));
            }
            if (reopen.length) {
                await tx.update(playerPayments).set({ status: 'pending' }).where(and(inArray(playerPayments.id, reopen), eq(playerPayments.status, 'void')));
            }
        });
        console.log('Corecturile au fost scrise.');
    }
}

if (require.main === module) {
    main()
        .catch((error) => { console.error(error); process.exitCode = 1; })
        .finally(async () => { await pool?.end(); await pglite?.close(); });
}
