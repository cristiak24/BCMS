import axios from 'axios';
import { getOrCompute } from './microCache';
import { FRB_HEADERS, getFrbApiKey } from './frbConfig';
import { stripTags } from './frbMatches';

/**
 * FRB "fișă meci" (widget 400 — GAME_FULL_VIEW_WIDGET): the single-game detail
 * view frbaschet.ro itself links to from its schedule ("Avancronica" icon).
 * Parsed from the same widget-service HTML-in-JSON payload as everything else
 * in frbMatches.ts/basketball.ts, just a different widget id.
 */

export interface GameDetail {
    homeTeam: string;
    awayTeam: string;
    homeScore: string;
    awayScore: string;
    /** One entry per quarter played (4, or more if it went to overtime). */
    quarters: { home: string; away: string }[];
    date: string;   // "DD.MM.YYYY"
    time: string;   // "HH:MM" sau ""
    broadcast: string;
    gameNumber: string;
    arena: string;
    attendance: string;
    referees: string[];
    commissioner: string;
}

function decodeEntities(s: string): string {
    return s
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&#039;/g, "'")
        .replace(/&quot;/g, '"')
        .replace(/\s+/g, ' ')
        .trim();
}

/** Pulls the value out of one "Label: <strong>value</strong>" line in the game-info block. */
function extractField(infoBlock: string, label: string): string {
    const re = new RegExp(`${label}:\\s*<strong>([\\s\\S]*?)</strong>`, 'i');
    const match = infoBlock.match(re);
    return match ? decodeEntities(stripTags(match[1])) : '';
}

export function parseGameWidget(raw: string): GameDetail | null {
    const htmlMatch = raw.match(/MBT\.API\.update\('.*?',\s*'([\s\S]*?)'\);/);
    if (!htmlMatch) return null;

    const html = htmlMatch[1]
        .replace(/\\n/g, '')
        .replace(/\\r/g, '')
        .replace(/\\t/g, '')
        .replace(/\\"/g, '"')
        .replace(/\\\//g, '/');

    const homeTeam = decodeEntities(stripTags(html.match(/mbt-game-card-team-a-name">([\s\S]*?)<\/span>/)?.[1] ?? ''));
    const awayTeam = decodeEntities(stripTags(html.match(/mbt-game-card-team-b-name">([\s\S]*?)<\/span>/)?.[1] ?? ''));
    if (!homeTeam || !awayTeam) return null;

    const homeScore = html.match(/mbt-game-card-score-a[^"]*">(\d+)</)?.[1] ?? '';
    const awayScore = html.match(/mbt-game-card-score-b[^"]*">(\d+)</)?.[1] ?? '';

    const quartersBlock = html.match(/mbt-gamecard-quarters">([\s\S]*?)<\/div>/)?.[1] ?? '';
    const quarters: { home: string; away: string }[] = [];
    const quarterRe = /<span>\s*(\d+)\s*-\s*(\d+)\s*<\/span>/g;
    let qMatch: RegExpExecArray | null;
    while ((qMatch = quarterRe.exec(quartersBlock)) !== null) {
        quarters.push({ home: qMatch[1], away: qMatch[2] });
    }

    // Note the leading `<div `: the *team* score cell is `<td class="mbt-gamecard-info">`
    // too, so matching the bare class string would grab that outer td (and the
    // score/quarters markup inside it) instead of this specific inner div.
    const infoBlock = html.match(/<div class="mbt-gamecard-info">([\s\S]*?)<\/div>/)?.[1] ?? '';

    const dateTimeMatch = infoBlock.match(/<strong>\s*(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2})?\s*<\/strong>/);
    const isoDate = dateTimeMatch?.[1] ?? '';
    const [year, month, day] = isoDate ? isoDate.split('-') : ['', '', ''];
    const date = isoDate ? `${day}.${month}.${year}` : '';
    const time = dateTimeMatch?.[2]?.trim() ?? '';

    const broadcastStation = extractField(infoBlock, 'Broadcasted on');
    const broadcastTimeMatch = infoBlock.match(/Broadcasted on:\s*<strong>[\s\S]*?<\/strong>\s*([\d:]{4,5})?/);
    const broadcast = broadcastStation
        ? [broadcastStation, broadcastTimeMatch?.[1]?.trim()].filter(Boolean).join(' · ')
        : '';

    const gameNumber = extractField(infoBlock, 'Game number');
    const arena = extractField(infoBlock, 'Arena');
    const attendance = extractField(infoBlock, 'Attendance');
    const refereesRaw = extractField(infoBlock, 'Referees');
    const referees = refereesRaw ? refereesRaw.split(',').map((r) => r.trim()).filter(Boolean) : [];
    const commissioner = extractField(infoBlock, 'Commissioner');

    return {
        homeTeam,
        awayTeam,
        homeScore,
        awayScore,
        quarters,
        date,
        time,
        broadcast,
        gameNumber,
        arena,
        attendance,
        referees,
        commissioner,
    };
}

const CACHE_TTL_MS = 10 * 60 * 1000;

export async function fetchFrbGameDetail(params: { gameId: string; seasonId: string }): Promise<GameDetail | null> {
    const key = `frb:game:${params.gameId}:${params.seasonId}`;
    return getOrCompute(key, CACHE_TTL_MS, async () => {
        const url = `https://widgets.baskethotel.com/widget-service/show?api=${getFrbApiKey()}&lang=ro&request[0][widget]=400&request[0][param][game_id]=${encodeURIComponent(params.gameId)}&request[0][param][season_id]=${encodeURIComponent(params.seasonId)}`;
        const response = await axios.get(url, { headers: FRB_HEADERS, timeout: 15_000 });
        return parseGameWidget(String(response.data ?? ''));
    });
}
