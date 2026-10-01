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

/**
 * Determină rezultatul W/L/D/N/A față de echipa cu teamId-ul dat.
 * trackingTeamId = ID-ul echipei urmărite (din query param).
 * Dacă nu putem determina → N/A.
 */
function determineResult(
    homeTeamRawHtml: string,
    awayTeamRawHtml: string,
    homeScore: string,
    awayScore: string,
    trackingTeamId: string
): 'W' | 'L' | 'D' | 'N/A' {
    if (!homeScore || !awayScore) return 'N/A';

    const h = parseInt(homeScore, 10);
    const a = parseInt(awayScore, 10);
    if (isNaN(h) || isNaN(a)) return 'N/A';

    // Încearcă să identifice echipa urmărită prin team_id în link-ul HTML brut
    // Dacă linkul HTML al echipei conține teamId-ul, știm care echipă e a noastră
    const isHome = homeTeamRawHtml.includes(`team_id=${trackingTeamId}`) ||
                   homeTeamRawHtml.includes(`team_id="${trackingTeamId}"`);
    const isAway = awayTeamRawHtml.includes(`team_id=${trackingTeamId}`) ||
                   awayTeamRawHtml.includes(`team_id="${trackingTeamId}"`);

    if (!isHome && !isAway) {
        // Fallback: prima echipă listată e gazda → tratăm din perspectiva gazdei
        if (h > a) return 'W';
        if (h < a) return 'L';
        return 'D';
    }

    if (isHome) {
        if (h > a) return 'W';
        if (h < a) return 'L';
        return 'D';
    }

    // isAway
    if (a > h) return 'W';
    if (a < h) return 'L';
    return 'D';
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
        const result = status === 'finished'
            ? determineResult(homeTeamRaw, awayTeamRaw, homeScore, awayScore, teamId)
            : 'N/A';

        matches.push({
            date: normalizedDateStr,
            time: timeStr,
            homeTeam,
            awayTeam,
            homeScore,
            awayScore,
            result,
            status,
            league,
            gameId,
        });
    }

    // Sortare cronologică: scheduled → viitoare (asc), finished → trecute (desc)
    // Returnăm în ordine crescătoare a datei — UI-ul va decide afișarea
    matches.sort((a, b) => parseDateToTimestamp(a.date) - parseDateToTimestamp(b.date));

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
