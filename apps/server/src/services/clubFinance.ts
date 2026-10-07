/**
 * Club money, read one way for every screen.
 *
 *  - getClubFeeSettings: the club's fee settings row (by `club_id`).
 *  - playerFees / clubBalances: what each player owes, from lib/feeSchedule.ts,
 *    so Plăți, Finanțe, Dashboard, Lot and team stats can no longer disagree.
 *  - collectedInRange: money that actually came in (paid rows by date).
 */
import { and, eq, gte, inArray, lte, sql } from 'drizzle-orm';
import { db } from '../db';
import { attendance, events, financialSettings, playerPayments, players, playersToTeams, teams, users } from '../db/schema';
import { computePlayerFees, summarizeFees, type ComputedFee, type FeeEvent, type FeeSettings, type FeeTotals, type LedgerRow } from '../lib/feeSchedule';
import { DEFAULT_PAYMENT_DUE_DAY } from '../lib/financeDefaults';
import { isPaidStatus } from '../lib/paymentLedger';

export type ClubSettingsRow = typeof financialSettings.$inferSelect;

const ATTENDED = new Set(['present', 'prezent', 'late']);

export function toFeeSettings(row: Pick<ClubSettingsRow, 'monthlyPlayerFee' | 'trainingLevy' | 'facilityFee' | 'paymentDueDay' | 'billingStartMonth'> | null): FeeSettings {
    return {
        monthlyPlayerFee: Number(row?.monthlyPlayerFee ?? 0) || 0,
        trainingLevy: Number(row?.trainingLevy ?? 0) || 0,
        facilityFee: Number(row?.facilityFee ?? 0) || 0,
        paymentDueDay: Number(row?.paymentDueDay ?? DEFAULT_PAYMENT_DUE_DAY) || DEFAULT_PAYMENT_DUE_DAY,
        billingStartMonth: row?.billingStartMonth ?? null,
    };
}

/** The club's settings row, created with neutral (zero) fees on first use. */
export async function getClubFeeSettings(clubId: number): Promise<ClubSettingsRow> {
    const [existing] = await db.select().from(financialSettings).where(eq(financialSettings.clubId, clubId)).limit(1);
    if (existing) return existing;

    await db
        .insert(financialSettings)
        .values({ clubId, monthlyPlayerFee: 0, trainingLevy: 0, facilityFee: 0, autoAdjust: 1, paymentDueDay: DEFAULT_PAYMENT_DUE_DAY })
        .onConflictDoNothing({ target: financialSettings.clubId });
    const [created] = await db.select().from(financialSettings).where(eq(financialSettings.clubId, clubId)).limit(1);
    return created;
}

type PlayerRow = typeof players.$inferSelect;

/** An inactive (left / archived) player is not billed new months. */
function isBillable(player: { status: string | null }) {
    return String(player.status ?? 'active').trim().toLowerCase() !== 'inactive';
}

function toLedgerRow(row: typeof playerPayments.$inferSelect): LedgerRow {
    return {
        id: row.id,
        status: row.status,
        feeIds: row.feeIds,
        month: row.month,
        year: row.year,
        amount: row.amount,
        description: row.description,
        date: row.date,
        createdAt: row.createdAt,
    };
}

function toFeeEvent(row: typeof events.$inferSelect): FeeEvent {
    return {
        id: row.id,
        title: row.title,
        description: row.description,
        amount: row.amount,
        status: row.status,
        type: row.type,
        startTime: row.startTime,
    };
}

/** Team ids per player (legacy players.team_id + memberships). */
async function teamIdsByPlayer(playerRows: Array<{ id: number; teamId: number | null }>) {
    const map = new Map<number, Set<number>>();
    playerRows.forEach((player) => map.set(player.id, new Set(player.teamId != null ? [player.teamId] : [])));
    const ids = playerRows.map((player) => player.id);
    if (ids.length) {
        const memberships = await db
            .select({ playerId: playersToTeams.playerId, teamId: playersToTeams.teamId })
            .from(playersToTeams)
            .where(inArray(playersToTeams.playerId, ids));
        memberships.forEach((row) => map.get(row.playerId)?.add(row.teamId));
    }
    return map;
}

/** Fee events of the given teams, and which of the past ones each player attended. */
async function loadFeeEvents(teamIds: number[], playerIds: number[]) {
    if (!teamIds.length) return { events: [] as Array<typeof events.$inferSelect>, attendedByPlayer: new Map<number, Set<number>>() };
    const eventRows = await db
        .select()
        .from(events)
        .where(and(inArray(events.teamId, teamIds), sql`${events.amount} > 0`));
    const attendedByPlayer = new Map<number, Set<number>>();
    const eventIds = eventRows.map((event) => event.id);
    if (eventIds.length && playerIds.length) {
        const rows = await db
            .select({ playerId: attendance.playerId, eventId: attendance.eventId, status: attendance.status })
            .from(attendance)
            .where(and(inArray(attendance.eventId, eventIds), inArray(attendance.playerId, playerIds)));
        for (const row of rows) {
            if (row.eventId == null || !ATTENDED.has(String(row.status ?? '').trim().toLowerCase())) continue;
            const set = attendedByPlayer.get(row.playerId) ?? new Set<number>();
            set.add(row.eventId);
            attendedByPlayer.set(row.playerId, set);
        }
    }
    return { events: eventRows, attendedByPlayer };
}

export type PlayerFeeResult = {
    fees: ComputedFee[];
    totals: FeeTotals;
    rows: Array<typeof playerPayments.$inferSelect>;
};

/** One player's fees — the player's own Plăți page. */
export async function playerFees(player: { id: number; teamId: number | null; createdAt: string | null; status: string | null }, clubId: number | null, now = new Date()): Promise<PlayerFeeResult> {
    const settings = clubId != null ? toFeeSettings(await getClubFeeSettings(clubId)) : toFeeSettings(null);
    const teamIds = Array.from((await teamIdsByPlayer([player])).get(player.id) ?? []);
    // Only this club's teams can bill the player.
    const clubTeamIds = teamIds.length && clubId != null
        ? (await db.select({ id: teams.id }).from(teams).where(and(inArray(teams.id, teamIds), eq(teams.clubId, clubId)))).map((row) => row.id)
        : [];
    const [rows, feeEvents] = await Promise.all([
        db.select().from(playerPayments).where(eq(playerPayments.playerId, player.id)),
        loadFeeEvents(clubTeamIds, [player.id]),
    ]);
    const fees = computePlayerFees({
        settings,
        rows: rows.map(toLedgerRow),
        events: feeEvents.events.map(toFeeEvent),
        attendedEventIds: feeEvents.attendedByPlayer.get(player.id) ?? new Set(),
        playerSince: player.createdAt ?? null,
        now,
        billRecurring: isBillable(player),
    });
    return { fees, totals: summarizeFees(fees), rows };
}

export type ClubPlayer = {
    player: PlayerRow;
    teamIds: number[];
    teamName: string | null;
};

/**
 * Players on the club's books: on one of its teams, or (club-wide view only)
 * linked by email to one of its accounts while on no team yet. Inactive
 * players stay in — an archived player can still owe money.
 */
export async function clubPlayers(clubId: number, teamId: number | null = null): Promise<ClubPlayer[]> {
    const teamRows = await db.select({ id: teams.id, name: teams.name }).from(teams).where(eq(teams.clubId, clubId));
    const scopedTeams = teamId != null ? teamRows.filter((team) => team.id === teamId) : teamRows;
    const teamName = new Map(scopedTeams.map((team) => [team.id, team.name]));
    const teamIds = scopedTeams.map((team) => team.id);

    const byId = new Map<number, PlayerRow>();
    if (teamIds.length) {
        const [direct, members] = await Promise.all([
            db.select().from(players).where(inArray(players.teamId, teamIds)),
            db.select({ player: players }).from(playersToTeams).innerJoin(players, eq(playersToTeams.playerId, players.id)).where(inArray(playersToTeams.teamId, teamIds)),
        ]);
        direct.forEach((player) => byId.set(player.id, player));
        members.forEach((row) => byId.set(row.player.id, row.player));
    }
    if (teamId == null) {
        const emails = (await db.select({ email: users.email }).from(users).where(eq(users.clubId, clubId)))
            .map((user) => user.email.trim().toLowerCase())
            .filter(Boolean);
        if (emails.length) {
            const linked = await db.select().from(players).where(inArray(sql<string>`lower(trim(${players.email}))`, emails));
            linked.forEach((player) => { if (!byId.has(player.id)) byId.set(player.id, player); });
        }
    }

    const teamsOf = await teamIdsByPlayer(Array.from(byId.values()));
    const clubTeamSet = new Set(teamRows.map((team) => team.id));
    return Array.from(byId.values()).map((player) => {
        const ids = Array.from(teamsOf.get(player.id) ?? []).filter((id) => clubTeamSet.has(id));
        const scoped = ids.find((id) => teamName.has(id));
        return { player, teamIds: ids, teamName: scoped != null ? teamName.get(scoped) ?? null : null };
    });
}

export type PlayerBalance = {
    playerId: number;
    playerName: string;
    teamName: string | null;
    status: string;
    fees: ComputedFee[];
} & FeeTotals;

export function playerDisplayName(player: Pick<PlayerRow, 'name' | 'firstName' | 'lastName' | 'email'>) {
    const parts = `${player.firstName ?? ''} ${player.lastName ?? ''}`.trim();
    return parts || player.name || player.email || 'Jucător';
}

/** What every player of the club (or of one team) owes, in one pass. */
export async function clubBalances(clubId: number, options: { teamId?: number | null; now?: Date } = {}): Promise<PlayerBalance[]> {
    const now = options.now ?? new Date();
    const roster = await clubPlayers(clubId, options.teamId ?? null);
    if (!roster.length) return [];
    const playerIds = roster.map((entry) => entry.player.id);
    const allTeamIds = Array.from(new Set(roster.flatMap((entry) => entry.teamIds)));

    const [settingsRow, paymentRows, feeEvents] = await Promise.all([
        getClubFeeSettings(clubId),
        db.select().from(playerPayments).where(inArray(playerPayments.playerId, playerIds)),
        loadFeeEvents(allTeamIds, playerIds),
    ]);
    const settings = toFeeSettings(settingsRow);
    const rowsByPlayer = new Map<number, LedgerRow[]>();
    paymentRows.forEach((row) => {
        const list = rowsByPlayer.get(row.playerId) ?? [];
        list.push(toLedgerRow(row));
        rowsByPlayer.set(row.playerId, list);
    });
    const eventsByTeam = new Map<number, FeeEvent[]>();
    feeEvents.events.forEach((event) => {
        if (event.teamId == null) return;
        const list = eventsByTeam.get(event.teamId) ?? [];
        list.push(toFeeEvent(event));
        eventsByTeam.set(event.teamId, list);
    });

    return roster.map(({ player, teamIds, teamName }) => {
        const playerEvents = new Map<number, FeeEvent>();
        teamIds.forEach((id) => (eventsByTeam.get(id) ?? []).forEach((event) => playerEvents.set(event.id, event)));
        const fees = computePlayerFees({
            settings,
            rows: rowsByPlayer.get(player.id) ?? [],
            events: Array.from(playerEvents.values()),
            attendedEventIds: feeEvents.attendedByPlayer.get(player.id) ?? new Set(),
            playerSince: player.createdAt ?? null,
            now,
            billRecurring: isBillable(player),
        });
        return {
            playerId: player.id,
            playerName: playerDisplayName(player),
            teamName,
            status: player.status ?? 'active',
            fees,
            ...summarizeFees(fees),
        };
    });
}

/** Money received between two dates (paid rows, by payment date). */
export async function collectedInRange(playerIds: number[], start: Date, end: Date) {
    if (!playerIds.length) return 0;
    const rows = await db
        .select({ amount: playerPayments.amount, status: playerPayments.status })
        .from(playerPayments)
        .where(and(
            inArray(playerPayments.playerId, playerIds),
            gte(playerPayments.date, start.toISOString()),
            lte(playerPayments.date, end.toISOString()),
        ));
    return rows.filter((row) => isPaidStatus(row.status)).reduce((sum, row) => sum + (Number(row.amount) || 0), 0);
}
