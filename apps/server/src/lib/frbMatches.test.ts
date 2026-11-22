import { test } from 'node:test';
import { strict as assert } from 'node:assert';

import { frbDateToUtc, mergeSeasonMonths, parseMatchesWidget, takeMovedFixture, type ParsedMatch } from './frbMatches';

test('frbDateToUtc: winter time (EET, UTC+2)', () => {
    assert.equal(frbDateToUtc('15.03.2025', '19:00')?.toISOString(), '2025-03-15T17:00:00.000Z');
});

test('frbDateToUtc: summer time (EEST, UTC+3)', () => {
    assert.equal(frbDateToUtc('15.07.2025', '19:00')?.toISOString(), '2025-07-15T16:00:00.000Z');
});

test('frbDateToUtc: the day after the spring DST switch', () => {
    assert.equal(frbDateToUtc('31.03.2025', '18:30')?.toISOString(), '2025-03-31T15:30:00.000Z');
});

test('frbDateToUtc: missing time defaults to 12:00 local; bad date is null', () => {
    assert.equal(frbDateToUtc('01.11.2025')?.toISOString(), '2025-11-01T10:00:00.000Z');
    assert.equal(frbDateToUtc('2025-11-01', '10:00'), null);
});

test('parseMatchesWidget: reads fixtures and results from the widget payload', () => {
    const html = [
        '<table><tbody>',
        '<tr><td>04.10.2025 18:00</td><td><a href="?team_id=77">CS Dinamo</a></td><td>-</td><td><a href="?team_id=12">CSM Oradea</a></td><td>LNBM</td></tr>',
        '<tr><td><a game_id="6145895">27.09.2025 17:30</a></td><td><a href="?team_id=12">CSM Oradea</a></td><td>70 - 82</td><td><a href="?team_id=77">CS Dinamo</a></td><td>LNBM</td></tr>',
        '<tr><td>Data</td><td>Gazde</td><td>Scor</td><td>Oaspeți</td></tr>',
        '</tbody></table>',
    ].join('');
    const raw = `MBT.API.update('w1', '${html.replace(/\//g, '\\/')}');`;

    const matches = parseMatchesWidget(raw, '77');
    assert.equal(matches.length, 2);

    const [result, fixture] = matches; // sorted by date ascending
    assert.equal(result.date, '27.09.2025');
    assert.equal(result.time, '17:30');
    assert.equal(result.status, 'finished');
    assert.equal(result.homeScore, '70');
    assert.equal(result.result, 'W'); // team 77 won away
    assert.equal(result.gameId, '6145895');

    assert.equal(fixture.homeTeam, 'CS Dinamo');
    assert.equal(fixture.status, 'scheduled');
    assert.equal(fixture.league, 'LNBM');
    assert.equal(fixture.gameId, ''); // no game_id in this row's markup
});

test('parseMatchesWidget: without team_id links, an away win is still a win (side inferred by name)', () => {
    const html = [
        '<table><tbody>',
        '<tr><td>03.10.2026 18:00</td><td>CS Rapid Bucuresti</td><td>62 - 87</td><td>CS Dinamo Bucuresti</td></tr>',
        '<tr><td>27.09.2026 18:00</td><td>CS Dinamo Bucuresti</td><td>70 - 75</td><td>CSO Voluntari</td></tr>',
        '<tr><td>20.09.2026 18:00</td><td>SCMU Craiova</td><td>-</td><td>CS Dinamo Bucuresti</td></tr>',
        '</tbody></table>',
    ].join('');
    const raw = `MBT.API.update('w1', '${html.replace(/\//g, '\\/')}');`;

    const byDate = Object.fromEntries(parseMatchesWidget(raw, '77').map((m) => [m.date, m]));
    assert.equal(byDate['03.10.2026'].result, 'W'); // away, 87 > 62
    assert.equal(byDate['27.09.2026'].result, 'L'); // home, 70 < 75
    assert.equal(byDate['20.09.2026'].result, 'N/A'); // not played
});

test('parseMatchesWidget: unknown side gives N/A, never a guessed result', () => {
    const html = '<table><tbody><tr><td>03.10.2026 18:00</td><td>A</td><td>62 - 87</td><td>B</td></tr></tbody></table>';
    const raw = `MBT.API.update('w1', '${html.replace(/\//g, '\\/')}');`;
    assert.equal(parseMatchesWidget(raw, '77')[0].result, 'N/A');
});

const fixture = (date: string, homeTeam = 'CSM', awayTeam = 'Rapid') => ({ date, homeTeam, awayTeam } as ParsedMatch);

test('mergeSeasonMonths: every month failing is an outage (null), not an empty season', () => {
    const down = Array.from({ length: 12 }, () => ({ status: 'rejected', reason: new Error('timeout') }) as PromiseSettledResult<ParsedMatch[]>);
    assert.equal(mergeSeasonMonths(down), null);
    const partly: PromiseSettledResult<ParsedMatch[]>[] = [
        { status: 'rejected', reason: new Error('timeout') },
        { status: 'fulfilled', value: [fixture('01.10.2026'), fixture('08.10.2026')] },
        { status: 'fulfilled', value: [fixture('08.10.2026')] },
        { status: 'fulfilled', value: [] },
    ];
    assert.deepEqual(mergeSeasonMonths(partly)?.map((m) => m.date), ['01.10.2026', '08.10.2026']);
    assert.deepEqual(mergeSeasonMonths(Array.from({ length: 12 }, () => ({ status: 'fulfilled', value: [] }) as PromiseSettledResult<ParsedMatch[]>)), []);
});

test('takeMovedFixture: a fixture moved to another day reuses its old synced row', () => {
    const orphans = [
        { id: 1, title: 'CSM vs Rapid', startTime: '2026-10-10T16:00:00.000Z' },
        { id: 2, title: 'CSM vs Dinamo', startTime: '2026-10-11T16:00:00.000Z' },
        { id: 3, title: 'csm vs rapid ', startTime: '2026-03-10T16:00:00.000Z' },
    ];
    const moved = takeMovedFixture(orphans, 'CSM vs Rapid', new Date('2026-10-11T15:00:00.000Z'));
    assert.equal(moved?.id, 1, 'the closest row with the same title');
    assert.deepEqual(orphans.map((o) => o.id), [2, 3], 'taken off the list so it is not used twice');
    assert.equal(takeMovedFixture(orphans, 'CSM vs Steaua', new Date()), null);
});
