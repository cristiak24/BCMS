import { Router } from 'express';
import axios from 'axios';

const router = Router();

const API_KEY = '9c3622c013ca2f69e8c373ecbf5af38e180f6d7d';
const REFERER = 'https://www.frbaschet.ro/';
const HEADERS = { Referer: REFERER };

// ---------- Types ----------

type MatchStatus = 'scheduled' | 'finished' | 'live';

interface ParsedMatch {
    date: string;          // "DD.MM.YYYY"
    time: string;          // "HH:MM" sau ""
    homeTeam: string;
    awayTeam: string;
    homeScore: string;     // număr ca string, sau "" dacă neprogramat
    awayScore: string;
    result: 'W' | 'L' | 'D' | 'N/A';
    status: MatchStatus;
    league: string;
}

// ---------- Helpers ----------

/**
 * Parsează scorul din formatul "75 - 60" sau "75-60" sau "?" în { home, away }.
 * Returnează { home: '', away: '' } dacă meciul nu are scor (neprogramat).
 */
function parseScore(rawScore: string): { home: string; away: string } {
    const clean = (rawScore || '').replace(/\s+/g, '').trim();

    // Dacă e gol, "?", "- " sau nu conține cifre — meci neprogramat
    if (!clean || clean === '?' || clean === '-' || !/\d/.test(clean)) {
        return { home: '', away: '' };
    }

    const parts = clean.split('-');
    if (parts.length !== 2) return { home: '', away: '' };

    const h = parts[0].trim();
    const a = parts[1].trim();

    // Ambele trebuie să fie numere valide
    if (!/^\d+$/.test(h) || !/^\d+$/.test(a)) {
        return { home: '', away: '' };
    }

    return { home: h, away: a };
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
function parseDateToTimestamp(dateStr: string): number {
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
function stripTags(s: string): string {
    return s.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
}

// ---------- GET /api/basketball/leagues ----------
router.get('/leagues', (_req, res) => {
    // Returnăm direct — lista este configurație fixă (ID-uri din FRB)
    res.json([
        { id: '25493', name: 'LNBM' },
        { id: '25523', name: 'Liga 1 Masculin' },
        { id: '25503', name: 'LNBF' },
        { id: '25533', name: 'Liga 1 Feminin' },
        { id: '8339', name: 'U18' },
        { id: '8348', name: 'U16' },
        { id: '8346', name: 'U14' },
    ]);
});

// ---------- GET /api/basketball/seasons?leagueId= ----------
router.get('/seasons', async (req, res) => {
    const { leagueId } = req.query as Record<string, string>;
    if (!leagueId) {
        res.status(400).json({ error: 'leagueId required' });
        return;
    }

    try {
        const url = `https://widgets.baskethotel.com/widget-service/show?api=${API_KEY}&request[0][widget]=320&request[0][param][league_id]=${leagueId}`;
        const response = await axios.get(url, { headers: HEADERS });
        const cleanData = (response.data as string).replace(/\\"/g, '"').replace(/\\\//g, '/');

        const regex = /value="(\d{5,7})"[^>]*>(\d{4}-\d{4})/g;
        const seasons: { id: string; text: string }[] = [];
        let match: RegExpExecArray | null;
        while ((match = regex.exec(cleanData)) !== null) {
            seasons.push({ id: match[1], text: match[2] });
        }

        res.json(seasons);
    } catch (e) {
        console.error('[basketball/seasons] error:', e);
        res.status(500).json({ error: 'Failed to fetch seasons' });
    }
});

// ---------- GET /api/basketball/teams?leagueId=&seasonId= ----------
router.get('/teams', async (req, res) => {
    const { leagueId, seasonId } = req.query as Record<string, string>;
    if (!leagueId || !seasonId) {
        res.status(400).json({ error: 'leagueId and seasonId required' });
        return;
    }

    try {
        const url = `https://widgets.baskethotel.com/widget-service/show?api=${API_KEY}&request[0][widget]=201&request[0][param][league_id][0]=${leagueId}&request[0][param][season_id]=${seasonId}&request[0][param][team_link_visible]=1&request[0][param][team_link_type]=3`;
        const response = await axios.get(url, { headers: HEADERS });
        const raw = (response.data as string).replace(/\\/g, '');

        const teams: { id: string; name: string }[] = [];
        const regexWithId = /team_id="(\d+)"[^>]*>(.*?)<\/a>/g;
        let match: RegExpExecArray | null;

        while ((match = regexWithId.exec(raw)) !== null) {
            teams.push({ id: match[1], name: match[2].replace(/<[^>]*>/g, '').trim() });
        }

        if (teams.length === 0) {
            const regexFallback = /id=(\d+)&amp;version=40x40"[\s\S]*?<strong>(.*?)<\/strong>/g;
            while ((match = regexFallback.exec(raw)) !== null) {
                teams.push({ id: match[1], name: match[2].trim() });
            }
        }

        // Deduplică după ID
        const uniqueTeams = Array.from(new Map(teams.map((t) => [t.id, t])).values());
        res.json(uniqueTeams);
    } catch (e) {
        console.error('[basketball/teams] error:', e);
        res.status(500).json({ error: 'Failed to fetch teams' });
    }
});

// ---------- GET /api/basketball/matches?teamId=&seasonId=&leagueId=&month= ----------
router.get('/matches', async (req, res) => {
    const { teamId, seasonId, month, leagueId } = req.query as Record<string, string>;
    if (!teamId || !seasonId || !leagueId) {
        res.status(400).json({ error: 'teamId, seasonId and leagueId required' });
        return;
    }

    try {
        const url = `https://widgets.baskethotel.com/widget-service/show?&api=${API_KEY}&lang=ro&request[0][widget]=200&request[0][part]=schedule_and_results&request[0][param][team_id]=${teamId}&request[0][param][league_id]=${leagueId}&request[0][param][season_id]=${seasonId}&request[0][param][month]=${month || ''}`;
        const response = await axios.get(url, { headers: HEADERS });

        const htmlMatch = (response.data as string).match(/MBT\.API\.update\('.*?',\s*'([\s\S]*?)'\);/);
        if (!htmlMatch) {
            res.json([]);
            return;
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

            // Coloana 0: dată (și opțional ora)
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
        });
    }

    // Sortare cronologică: scheduled → viitoare (asc), finished → trecute (desc)
    // Returnăm în ordine crescătoare a datei — UI-ul va decide afișarea
    matches.sort((a, b) => parseDateToTimestamp(a.date) - parseDateToTimestamp(b.date));

    res.json(matches);
    } catch (e) {
        console.error('[basketball/matches] error:', e);
        res.status(500).json({ error: 'Failed to fetch matches' });
    }
});

// ---------- GET /api/basketball/dashboard-summary ----------
// Agregă date din finance + players pentru KPI-uri dashboard
router.get('/dashboard-summary', async (_req, res) => {
    res.status(501).json({ message: 'Use /api/dashboard/summary instead' });
});

export default router;
