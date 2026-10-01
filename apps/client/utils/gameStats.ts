/**
 * Live match statistics — the client copy of apps/server/src/lib/gameStats.ts
 * (types + computeBoxScore). Keep the two in sync: the scorer derives the
 * on-screen score from this, the server derives the stored snapshot from its.
 */

export type GameMode = 'simple' | 'full';
export type Side = 'us' | 'them';

export const SIMPLE_TYPES = ['p1', 'p2', 'p3', 'foul', 'sub', 'period_start', 'period_end'] as const;
export const FULL_ONLY_TYPES = ['m1', 'm2', 'm3', 'reb_o', 'reb_d', 'ast', 'stl', 'blk', 'tov', 'timeout'] as const;
export const EVENT_TYPES = [...SIMPLE_TYPES, ...FULL_ONLY_TYPES] as const;
export type EventType = (typeof EVENT_TYPES)[number];

export const POINTS: Partial<Record<EventType, number>> = { p1: 1, p2: 2, p3: 3 };

export type GameEvent = {
    clientId: string;
    seq: number;
    period: number;
    clockSec: number | null;
    side: Side;
    playerId: number | null;
    /** The player coming off, for 'sub' (playerId is the one coming on). */
    otherPlayerId: number | null;
    oppNumber: string | null;
    type: EventType;
    deleted: boolean;
};

export type PlayerLine = {
    pts: number;
    fgm2: number; fga2: number;
    fgm3: number; fga3: number;
    ftm: number; fta: number;
    rebO: number; rebD: number;
    ast: number; stl: number; blk: number; tov: number;
    pf: number;
    /** Seconds on court; null when the game was kept without a clock. */
    secondsPlayed: number | null;
};

export function emptyLine(): PlayerLine {
    return { pts: 0, fgm2: 0, fga2: 0, fgm3: 0, fga3: 0, ftm: 0, fta: 0, rebO: 0, rebD: 0, ast: 0, stl: 0, blk: 0, tov: 0, pf: 0, secondsPlayed: null };
}

function apply(line: PlayerLine, type: EventType) {
    switch (type) {
        case 'p1': line.pts += 1; line.ftm += 1; line.fta += 1; break;
        case 'p2': line.pts += 2; line.fgm2 += 1; line.fga2 += 1; break;
        case 'p3': line.pts += 3; line.fgm3 += 1; line.fga3 += 1; break;
        case 'm1': line.fta += 1; break;
        case 'm2': line.fga2 += 1; break;
        case 'm3': line.fga3 += 1; break;
        case 'reb_o': line.rebO += 1; break;
        case 'reb_d': line.rebD += 1; break;
        case 'ast': line.ast += 1; break;
        case 'stl': line.stl += 1; break;
        case 'blk': line.blk += 1; break;
        case 'tov': line.tov += 1; break;
        case 'foul': line.pf += 1; break;
        default: break;
    }
}

export type BoxScore = {
    us: number;
    them: number;
    byPeriod: { period: number; us: number; them: number }[];
    teamFouls: Record<number, { us: number; them: number }>;
    players: Record<number, PlayerLine>;
    opponents: Record<string, PlayerLine>;
    onCourt: number[];
};

/**
 * Everything derived from the event list. `starters` is who began period 1;
 * each later period starts with whoever was on court when the previous ended.
 * Minutes need a clock: with `periodSec` set, time on court is summed from
 * period starts/ends and the clock stamps of substitutions.
 */
export function computeBoxScore(events: GameEvent[], starters: number[], periodSec: number | null): BoxScore {
    const live = events.filter((e) => !e.deleted).sort((a, b) => a.seq - b.seq);
    const box: BoxScore = { us: 0, them: 0, byPeriod: [], teamFouls: {}, players: {}, opponents: {}, onCourt: [...starters] };
    const line = (id: number) => (box.players[id] ??= emptyLine());
    const opp = (n: string) => (box.opponents[n] ??= emptyLine());
    starters.forEach((id) => line(id));

    const periodRow = (p: number) => {
        let row = box.byPeriod.find((r) => r.period === p);
        if (!row) { row = { period: p, us: 0, them: 0 }; box.byPeriod.push(row); }
        return row;
    };

    // Minutes: when each on-court player last came on, as a clock stamp.
    const timed = periodSec != null;
    const since = new Map<number, number>();
    let periodOpen = false;
    const credit = (id: number, from: number, to: number) => {
        const l = line(id);
        l.secondsPlayed = (l.secondsPlayed ?? 0) + Math.max(0, from - to);
    };
    if (timed) starters.forEach((id) => { line(id).secondsPlayed = 0; });

    for (const e of live) {
        if (e.type === 'period_start') {
            periodRow(e.period);
            if (timed) {
                periodOpen = true;
                box.onCourt.forEach((id) => since.set(id, e.clockSec ?? periodSec!));
            }
            continue;
        }
        if (e.type === 'period_end') {
            if (timed && periodOpen) {
                box.onCourt.forEach((id) => credit(id, since.get(id) ?? periodSec!, e.clockSec ?? 0));
                since.clear();
                periodOpen = false;
            }
            continue;
        }
        if (e.type === 'sub' && e.playerId != null && e.otherPlayerId != null) {
            if (timed && periodOpen) {
                credit(e.otherPlayerId, since.get(e.otherPlayerId) ?? periodSec!, e.clockSec ?? 0);
                since.delete(e.otherPlayerId);
                since.set(e.playerId, e.clockSec ?? 0);
            }
            box.onCourt = box.onCourt.filter((id) => id !== e.otherPlayerId);
            if (!box.onCourt.includes(e.playerId)) box.onCourt.push(e.playerId);
            line(e.playerId);
            if (timed) line(e.playerId).secondsPlayed ??= 0;
            continue;
        }

        const pts = POINTS[e.type] ?? 0;
        const row = periodRow(e.period);
        if (e.side === 'us') {
            box.us += pts;
            row.us += pts;
            if (e.playerId != null) apply(line(e.playerId), e.type);
        } else {
            box.them += pts;
            row.them += pts;
            if (e.oppNumber != null) apply(opp(e.oppNumber), e.type);
        }
        if (e.type === 'foul') {
            const tf = (box.teamFouls[e.period] ??= { us: 0, them: 0 });
            tf[e.side] += 1;
        }
    }

    box.byPeriod.sort((a, b) => a.period - b.period);
    return box;
}
