import { test } from 'node:test';
import { strict as assert } from 'node:assert';

import { emptyLine, type PlayerLine } from './gameStats';
import { seasonBounds, seasonTotals } from './seasonStats';

const line = (patch: Partial<PlayerLine>): PlayerLine => ({ ...emptyLine(), ...patch });

test('the season runs 1 August to 31 July, Romanian calendar', () => {
    const autumn = seasonBounds(new Date('2026-10-19T10:00:00.000Z'));
    assert.equal(autumn.label, '2026–27');
    assert.equal(autumn.start.toISOString(), '2026-07-31T21:00:00.000Z');
    assert.equal(autumn.end.toISOString(), '2027-07-31T21:00:00.000Z');
    assert.equal(seasonBounds(new Date('2027-03-01T10:00:00.000Z')).label, '2026–27');
    // 1 August 00:30 in Romania is still 31 July in UTC.
    assert.equal(seasonBounds(new Date('2027-07-31T21:30:00.000Z')).label, '2027–28');
});

test('points and fouls average over every match; full-mode stats only over full-mode matches', () => {
    const s = seasonTotals([
        { mode: 'simple', line: line({ pts: 10, fgm2: 5, fga2: 5, pf: 2 }) },
        { mode: 'full', line: line({ pts: 6, fgm2: 3, fga2: 6, rebD: 4, rebO: 1, ast: 3, pf: 1, fgm3: 0, fga3: 2, ftm: 0, fta: 2 }) },
    ]);
    assert.equal(s.games, 2);
    assert.equal(s.averages.pts, 8);
    assert.equal(s.averages.pf, 1.5);
    assert.equal(s.averages.reb, 5, 'not 2.5: the simple sheet recorded no rebounds');
    assert.equal(s.averages.ast, 3);
    // Shooting from full mode only: the simple sheet's 5/5 has no misses.
    assert.equal(s.shooting.fg2Pct, 50);
    assert.equal(s.shooting.fg3Pct, 0);
    assert.equal(s.shooting.ftPct, 0);
    assert.equal(s.totals.fgm2, 8, 'made baskets still count from every match');
});

test('percentages come from summed attempts, not an average of percentages', () => {
    const s = seasonTotals([
        { mode: 'full', line: line({ fgm2: 1, fga2: 1 }) },
        { mode: 'full', line: line({ fgm2: 1, fga2: 9 }) },
    ]);
    assert.equal(s.shooting.fg2Pct, 20, '2/10, not (100% + 11%) / 2');
});

test('minutes only from matches kept with a clock; nothing to average reads as null', () => {
    const s = seasonTotals([
        { mode: 'full', line: line({ secondsPlayed: 600 }) },
        { mode: 'full', line: line({ secondsPlayed: null }) },
    ]);
    assert.equal(s.averages.minutes, 10);
    const none = seasonTotals([]);
    assert.equal(none.averages.pts, null);
    assert.equal(none.shooting.fg2Pct, null);
});
