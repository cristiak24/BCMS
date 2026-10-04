import axios from 'axios';
import { getOrCompute } from './microCache';
import { FRB_HEADERS, getFrbApiKey } from './frbConfig';

/**
 * FRB (baskethotel widget) fixtures: fetch + parse, shared by the
 * /api/basketball/matches proxy and the events sync, so both read the widget
 * the same way. Responses are cached briefly — the sync fans out one request
 * per team per month.
 */

export type MatchStatus = 'scheduled' | 'finished' | 'live';

export interface ParsedMatch {
    date: string;          // "DD.MM.YYYY"
    time: string;          // "HH:MM" sau ""
    homeTeam: string;
    awayTeam: string;
    homeScore: string;     // număr ca string, sau "" dacă neprogramat
    awayScore: string;
    result: 'W' | 'L' | 'D' | 'N/A';
    status: MatchStatus;
    league: string;
    /** FRB's internal game id (widget 303's `game_id`), needed to load the match sheet (widget 400). Empty if the row didn't carry one. */
    gameId: string;
}

/**
 * Parsează scorul din formatul "75 - 60", "75-60", "75 : 60" sau "?" în { home, away }.
 * Returnează { home: '', away: '' } dacă meciul nu are scor (neprogramat).
 */
export function parseScore(rawScore: string): { home: string; away: string } {
    const clean = (rawScore || '').replace(/\s+/g, '').trim();

    // Dacă e gol, "?", "- " sau nu conține cifre — meci neprogramat
    if (!clean || clean === '?' || /^[-:–—]+$/.test(clean) || !/\d/.test(clean)) {
        return { home: '', away: '' };
    }

    const scoreMatch = clean.match(/^(\d+)[-:–—](\d+)$/);
    if (!scoreMatch) return { home: '', away: '' };

    return { home: scoreMatch[1], away: scoreMatch[2] };
}

/**
 * Determină statusul unui meci pe baza scorului și datei.
 * - Dacă nu există scor → scheduled
 * - Dacă există scor → finished
 * (Live detection nu e suportată de API-ul FRB prin scraping static)
 */
function determineStatus(homeScore: string, awayScore: string): MatchStatus {
    if (!homeScore || !awayScore) return 'scheduled';
    return 'finished';
}

type Side = 'home' | 'away';

/** Which side of a row the tracked team is on, from the team_id in its links. */
function sideFromLinks(homeTeamRawHtml: string, awayTeamRawHtml: string, trackingTeamId: string): Side | null {
    const linksTo = (html: string) => html.includes(`team_id=${trackingTeamId}`) || html.includes(`team_id="${trackingTeamId}"`);
    if (linksTo(homeTeamRawHtml)) return 'home';
    if (linksTo(awayTeamRawHtml)) return 'away';
    return null;
}

/** W/L/D for the tracked team; N/A when the score or the side is unknown. */
function determineResult(homeScore: string, awayScore: string, side: Side | null): 'W' | 'L' | 'D' | 'N/A' {
    if (!homeScore || !awayScore || !side) return 'N/A';
    const h = parseInt(homeScore, 10);
    const a = parseInt(awayScore, 10);
    if (isNaN(h) || isNaN(a)) return 'N/A';
    const ours = side === 'home' ? h : a;
    const theirs = side === 'home' ? a : h;
    if (ours > theirs) return 'W';
    if (ours < theirs) return 'L';
    return 'D';
}

/**
 * The tracked team's name as this widget spells it: the one name present in
 * (nearly) every row of a team's schedule. Used when the rows carry no
 * team_id links — the old fallback assumed the home side, which flipped every
 * away result (e.g. Rapid 62 – Dinamo 87 shown as a Dinamo loss).
 */
export function inferTrackedTeamName(rows: { homeTeam: string; awayTeam: string }[]): string | null {
    const counts = new Map<string, number>();
    for (const row of rows) {
        for (const name of [row.homeTeam, row.awayTeam]) {
            counts.set(name, (counts.get(name) ?? 0) + 1);
        }
    }
    let best: string | null = null;
    let max = 0;
    let tie = false;
    for (const [name, count] of counts) {
        if (count > max) {
            best = name;
            max = count;
            tie = false;
        } else if (count === max) {
            tie = true;
        }
    }
    return best && max >= 2 && !tie ? best : null;
}

/**
 * Convertește un șir "DD.MM.YYYY" într-un timestamp numeric pentru sortare.
 * Returnează 0 dacă parsing eșuează.
 */
export function parseDateToTimestamp(dateStr: string): number {
    if (!dateStr) return 0;
    const parts = dateStr.split('.');
    if (parts.length !== 3) return 0;
    const [day, month, year] = parts.map(Number);
    if (isNaN(day) || isNaN(month) || isNaN(year)) return 0;
    return new Date(year, month - 1, day).getTime();
}

/**
 * Strip-ează tag-urile HTML și normalizează whitespace-ul.
 */
export function stripTags(s: string): string {
    return s.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
}


/** Parse one schedule_and_results widget response into matches. */
export function parseMatchesWidget(raw: string, teamId: string): ParsedMatch[] {
    const htmlMatch = raw.match(/MBT\.API\.update\('.*?',\s*'([\s\S]*?)'\);/);
    if (!htmlMatch) {
        return [];
    }

    const html = htmlMatch[1]
        .replace(/\\n/g, '')
        .replace(/\\r/g, '')
        .replace(/\\t/g, '')
        .replace(/\\"/g, '"')
        .replace(/\\\//g, '/');

    // Parsăm rândurile tabelului HTML
    const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
    const matches: ParsedMatch[] = [];
    const sides: (Side | null)[] = [];

    let rowMatch: RegExpExecArray | null;
    while ((rowMatch = rowRegex.exec(html)) !== null) {
        const rowHtml = rowMatch[1];

        // Extragem celulele cu HTML raw (înainte de strip) pentru detectarea team_id
        const rawCells: string[] = [];
        const cellReg = /<td[^>]*>([\s\S]*?)<\/td>/gi;
        let cellMatch: RegExpExecArray | null;
        while ((cellMatch = cellReg.exec(rowHtml)) !== null) {
            rawCells.push(cellMatch[1]);
        }

        if (rawCells.length < 4 || !stripTags(rawCells[0]).trim()) continue;

        // Coloana 0: dată (și opțional ora), învelită într-un <a game_id="...">
        // care leagă rândul de fișa meciului (widget 400 — vezi frbGameDetail.ts).
        const gameId = rawCells[0].match(/game_id="(\d+)"/)?.[1] ?? '';
        const rawDate = stripTags(rawCells[0]).trim();
        // Data poate fi "15.03.2025" sau "15.03.2025 19:00"
        const dateParts = rawDate.split(/\s+/);
        const dateStr = dateParts[0] || '';
        const timeStr = dateParts[1] || '';

        // Validare și normalizare a datei la DD.MM.YYYY
        let normalizedDateStr = dateStr;
        if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
            // Dacă formatul este YYYY-MM-DD
            const parts = dateStr.split('-');
            normalizedDateStr = `${parts[2]}.${parts[1]}.${parts[0]}`;
        } else if (!/^\d{2}\.\d{2}\.\d{4}$/.test(dateStr)) {
            continue;
        }

        // Coloana 1: echipa gazdă (HTML raw pentru detectare team_id)
        const homeTeamRaw = rawCells[1] || '';
        const homeTeam = stripTags(homeTeamRaw);

        // Coloana 2: scor
        const rawScore = stripTags(rawCells[2] || '');
        const { home: homeScore, away: awayScore } = parseScore(rawScore);

        // Coloana 3: echipa oaspete (HTML raw pentru detectare team_id)
        const awayTeamRaw = rawCells[3] || '';
        const awayTeam = stripTags(awayTeamRaw);

        // Coloana 4 (opțional): liga/categoria
        const league = rawCells[4] ? stripTags(rawCells[4]).trim() : '';

        if (!homeTeam || !awayTeam) continue;

        const status = determineStatus(homeScore, awayScore);
        const side = sideFromLinks(homeTeamRaw, awayTeamRaw, teamId);
        sides.push(side);

        matches.push({
            date: normalizedDateStr,
            time: timeStr,
            homeTeam,
            awayTeam,
            homeScore,
            awayScore,
            status,
            league,
            gameId,
            result: status === 'finished' ? determineResult(homeScore, awayScore, side) : 'N/A',
        });
    }

    // Rows without team_id links: place the tracked team by name instead.
    if (sides.some((side) => side === null)) {
        const tracked = inferTrackedTeamName(matches);
        matches.forEach((match, index) => {
            if (sides[index] !== null || match.status !== 'finished' || !tracked) return;
            const side: Side | null = match.homeTeam === tracked ? 'home' : match.awayTeam === tracked ? 'away' : null;
            match.result = determineResult(match.homeScore, match.awayScore, side);
        });
    }

    // Sortare cronologică: scheduled → viitoare (asc), finished → trecute (desc)
    // Returnăm în ordine crescătoare a datei — UI-ul va decide afișarea
    matches.sort((a, b) => parseDateToTimestamp(a.date) - parseDateToTimestamp(b.date));
    return matches;
}

const CACHE_TTL_MS = 10 * 60 * 1000;

export async function fetchFrbMatches(params: { leagueId: string; seasonId: string; teamId: string; month?: string | number }) {
    const month = params.month == null ? '' : String(params.month);
    const key = `frb:matches:${params.leagueId}:${params.seasonId}:${params.teamId}:${month}`;
    return getOrCompute(key, CACHE_TTL_MS, async () => {
        // Widget 303 (SEASON_SCHEDULE_LONG_WIDGET) renders the exact same rows as
        // the old widget 200, just with each row's date cell wrapped in a
        // `<a game_id="...">` — that id is what unlocks the match sheet (widget
        // 400: quarters, referees, arena — see frbGameDetail.ts). Widget 200 never
        // exposes a game id at all, so it can't be patched in; this had to switch.
        // Unlike widget 200, its month filter lives under `filter[month]` (a
        // nested object, matching its own front-end's `filter.month = ...`) — a
        // bare `param[month]` is silently ignored and returns the whole season.
        const url = `https://widgets.baskethotel.com/widget-service/show?&api=${getFrbApiKey()}&lang=ro&request[0][widget]=303&request[0][part]=schedule_and_results&request[0][param][team_id]=${encodeURIComponent(params.teamId)}&request[0][param][league_id]=${encodeURIComponent(params.leagueId)}&request[0][param][season_id]=${encodeURIComponent(params.seasonId)}&request[0][param][filter][month]=${encodeURIComponent(month)}&request[0][param][game_link_visible]=1&request[0][param][game_link_type]=3`;
        const response = await axios.get(url, { headers: FRB_HEADERS, timeout: 15_000 });
        return parseMatchesWidget(String(response.data ?? ''), params.teamId);
    });
}

/** Offset (ms) of `timeZone` from UTC at the instant `utcMs`. */
function zoneOffsetMs(utcMs: number, timeZone: string) {
    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone,
        hourCycle: 'h23',
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit',
    }).formatToParts(new Date(utcMs));
    const get = (type: string) => Number(parts.find((part) => part.type === type)?.value);
    const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
    return asUtc - utcMs;
}

/**
 * FRB lists Romanian wall-clock times ("15.03.2025 19:00"). The server runs in
 * UTC, so `new Date(y, m, d, 19, 0)` stored 19:00 UTC — 21:00/22:00 in
 * Romania. Resolve through Europe/Bucharest instead (DST-aware). Returns null
 * for an unparseable date; a missing time defaults to 12:00.
 */
export function frbDateToUtc(dateStr: string, timeStr?: string): Date | null {
    const match = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(dateStr.trim());
    if (!match) return null;
    const [, dd, mm, yyyy] = match;
    const timeMatch = /^(\d{1,2}):(\d{2})$/.exec((timeStr ?? '').trim());
    const hours = timeMatch ? Number(timeMatch[1]) : 12;
    const minutes = timeMatch ? Number(timeMatch[2]) : 0;
    const guess = Date.UTC(Number(yyyy), Number(mm) - 1, Number(dd), hours, minutes);
    const first = guess - zoneOffsetMs(guess, 'Europe/Bucharest');
    // Second pass settles the rare case where the guess and the answer sit on
    // opposite sides of a DST switch.
    const settled = guess - zoneOffsetMs(first, 'Europe/Bucharest');
    return new Date(settled);
}
