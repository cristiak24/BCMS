import { clubDateParts, clubDateTime } from './clubTime';
import type { GameMode, PlayerLine } from './gameStats';

/**
 * Season statistics of a player, summed from the box scores of finished
 * matches (computeBoxScore per match). A basketball season runs 1 August to
 * 31 July, Romanian calendar.
 *
 * Simple-mode sheets only record made baskets and fouls, so rebounds, assists,
 * steals, blocks, turnovers and shooting percentages come from full-mode
 * matches only, and minutes from matches kept with a clock. Each average is
 * divided by the matches that could have recorded it, and percentages come
 * from summed makes/attempts (not an average of per-match percentages).
 */

export function seasonBounds(date: Date = new Date()) {
    const { year, month } = clubDateParts(date);
    const startYear = month >= 8 ? year : year - 1;
    return {
        startYear,
        label: `${startYear}–${String(startYear + 1).slice(-2)}`,
        start: clubDateTime(startYear, 8, 1),
        end: clubDateTime(startYear + 1, 8, 1),
    };
}

export type SeasonGameLine = { mode: GameMode; line: PlayerLine };

const round1 = (value: number) => Math.round(value * 10) / 10;
const avg = (total: number, games: number) => (games ? round1(total / games) : null);
const pct = (made: number, attempts: number) => (attempts ? Math.round((made / attempts) * 100) : null);

export function seasonTotals(games: SeasonGameLine[]) {
    const full = games.filter((g) => g.mode === 'full');
    const timed = games.filter((g) => g.line.secondsPlayed != null);
    const sum = (list: SeasonGameLine[], pick: (l: PlayerLine) => number) => list.reduce((acc, g) => acc + pick(g.line), 0);

    const totals = {
        pts: sum(games, (l) => l.pts),
        pf: sum(games, (l) => l.pf),
        fgm2: sum(games, (l) => l.fgm2),
        fgm3: sum(games, (l) => l.fgm3),
        ftm: sum(games, (l) => l.ftm),
        reb: sum(full, (l) => l.rebO + l.rebD),
        ast: sum(full, (l) => l.ast),
        stl: sum(full, (l) => l.stl),
        blk: sum(full, (l) => l.blk),
        tov: sum(full, (l) => l.tov),
        secondsPlayed: sum(timed, (l) => l.secondsPlayed ?? 0),
    };
    // Attempts exist only where misses were recorded.
    const shots = {
        fgm2: sum(full, (l) => l.fgm2), fga2: sum(full, (l) => l.fga2),
        fgm3: sum(full, (l) => l.fgm3), fga3: sum(full, (l) => l.fga3),
        ftm: sum(full, (l) => l.ftm), fta: sum(full, (l) => l.fta),
    };

    return {
        games: games.length,
        fullGames: full.length,
        timedGames: timed.length,
        totals,
        averages: {
            pts: avg(totals.pts, games.length),
            pf: avg(totals.pf, games.length),
            reb: avg(totals.reb, full.length),
            ast: avg(totals.ast, full.length),
            stl: avg(totals.stl, full.length),
            blk: avg(totals.blk, full.length),
            tov: avg(totals.tov, full.length),
            minutes: timed.length ? round1(totals.secondsPlayed / 60 / timed.length) : null,
        },
        shooting: {
            ...shots,
            fg2Pct: pct(shots.fgm2, shots.fga2),
            fg3Pct: pct(shots.fgm3, shots.fga3),
            ftPct: pct(shots.ftm, shots.fta),
        },
    };
}

export type SeasonTotals = ReturnType<typeof seasonTotals>;
