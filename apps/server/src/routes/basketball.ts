import { Router } from 'express';
import axios from 'axios';
import { authenticate } from '../middleware/auth';
import { rateLimit } from '../middleware/rateLimit';
import { FRB_HEADERS, getFrbApiKey } from '../lib/frbConfig';
import { fetchFrbMatches, stripTags } from '../lib/frbMatches';
import { fetchFrbGameDetail } from '../lib/frbGameDetail';

const router = Router();

// Every endpoint below fans out to an upstream FRB widget service on our own API key
// and our own egress bill. Leaving them anonymous let the whole internet spend both,
// and gave away a working key to anyone who watched the traffic. This is federation
// reference data that only signed-in users have any reason to read, so authentication
// is enough — no role gate, since every role legitimately reads it.
router.use(authenticate);

const HEADERS = FRB_HEADERS;
// Same bound as lib/frbMatches.ts: a silent FRB must not hold the request open forever.
const FRB_TIMEOUT_MS = 15_000;

// Bounds how fast one caller can make us hammer the upstream widget service. It is a
// per-instance guard against accidental render loops and casual abuse, layered on top
// of the authentication above rather than instead of it.
const basketballProxyRateLimit = rateLimit({ bucket: 'basketball:proxy', limit: 60, windowMs: 60_000 });

// ---------- Types ----------

interface ParsedStanding {
    position: number;
    team: string;
    wins: number;
    losses: number;
    played: number;
    points: number;
}

// ---------- Helpers ----------

function decodeWidgetHtml(raw: string): string {
    return raw
        .replace(/\\n/g, '')
        .replace(/\\r/g, '')
        .replace(/\\t/g, '')
        .replace(/\\"/g, '"')
        .replace(/\\\//g, '/')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&#039;/g, "'")
        .replace(/&quot;/g, '"');
}

function parseStandingsTable(raw: string): ParsedStanding[] {
    const htmlMatch = raw.match(/MBT\.API\.update\('[^']*',\s*'([\s\S]*?)'\);/);
    const html = decodeWidgetHtml(htmlMatch?.[1] ?? raw);
    const bodyMatch = html.match(/<tbody[^>]*>([\s\S]*?)<\/tbody>/i);
    const tbody = bodyMatch?.[1] ?? html;
    const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
    const rows: ParsedStanding[] = [];

    let rowMatch: RegExpExecArray | null;
    while ((rowMatch = rowRegex.exec(tbody)) !== null) {
        const cells: string[] = [];
        const cellRegex = /<td[^>]*>([\s\S]*?)<\/td>/gi;
        let cellMatch: RegExpExecArray | null;
        while ((cellMatch = cellRegex.exec(rowMatch[1])) !== null) {
            cells.push(stripTags(cellMatch[1]));
        }

        if (cells.length < 4) continue;

        const position = Number(cells[0].replace(/[^\d]/g, ''));
        const team = cells[1].trim();
        const recordMatch = cells[2].replace(/\s+/g, '').match(/^(\d+)\/(\d+)$/);
        const wins = Number(recordMatch?.[1] ?? NaN);
        const losses = Number(recordMatch?.[2] ?? NaN);
        const points = Number(cells[3].replace(/[^\d-]/g, ''));

        if (!Number.isFinite(position) || !team || !Number.isFinite(wins) || !Number.isFinite(losses) || !Number.isFinite(points)) {
            continue;
        }

        rows.push({
            position,
            team,
            wins,
            losses,
            played: wins + losses,
            points,
        });
    }

    return rows;
}

// ---------- GET /api/basketball/leagues ----------
/**
 * FRB competitions, by the `leagueId` each frbaschet.ro competition page embeds
 * (read 2026-10-18; the client's components/myclub/frbLeagues.ts is the same
 * list). Only seniors and U14–U18 boys were listed, so children's teams (U12,
 * U13, U15, U20, every girls' league) could not be found. Liga a II-a is left
 * out: its last FRB season is 2012-2013.
 */
export const FRB_LEAGUES: ReadonlyArray<{ id: string; name: string; gender: 'M' | 'F' }> = [
    { id: '25493', name: 'LNBM', gender: 'M' },
    { id: '25523', name: 'Liga 1 Masculin', gender: 'M' },
    { id: '8336', name: 'Cupa României Masculin', gender: 'M' },
    { id: '39679', name: 'Supercupa Masculin', gender: 'M' },
    { id: '8342', name: 'U20 Masculin', gender: 'M' },
    { id: '43666', name: 'U19 Masculin', gender: 'M' },
    { id: '8339', name: 'U18 Masculin', gender: 'M' },
    { id: '8353', name: 'U17 Masculin', gender: 'M' },
    { id: '8348', name: 'U16 Masculin', gender: 'M' },
    { id: '8351', name: 'U15 Masculin', gender: 'M' },
    { id: '8346', name: 'U14 Masculin', gender: 'M' },
    { id: '8349', name: 'U13 Masculin', gender: 'M' },
    { id: '8943', name: 'U12 Masculin', gender: 'M' },
    { id: '44533', name: 'U12 4x4 Masculin', gender: 'M' },
    { id: '35627', name: 'CAN U12 Masculin', gender: 'M' },
    { id: '8963', name: 'CAN U10 Masculin', gender: 'M' },
    { id: '25503', name: 'LNBF', gender: 'F' },
    { id: '25533', name: 'Liga 1 Feminin', gender: 'F' },
    { id: '8337', name: 'Cupa României Feminin', gender: 'F' },
    { id: '8343', name: 'U20 Feminin', gender: 'F' },
    { id: '43665', name: 'U19 Feminin', gender: 'F' },
    { id: '8340', name: 'U18 Feminin', gender: 'F' },
    { id: '8354', name: 'U17 Feminin', gender: 'F' },
    { id: '8347', name: 'U16 Feminin', gender: 'F' },
    { id: '8352', name: 'U15 Feminin', gender: 'F' },
    { id: '8345', name: 'U14 Feminin', gender: 'F' },
    { id: '8350', name: 'U13 Feminin', gender: 'F' },
    { id: '8953', name: 'U12 Feminin', gender: 'F' },
    { id: '44534', name: 'U12 4x4 Feminin', gender: 'F' },
    { id: '35629', name: 'CAN U12 Feminin', gender: 'F' },
    { id: '8973', name: 'CAN U10 Feminin', gender: 'F' },
];

router.get('/leagues', (_req, res) => {
    res.json(FRB_LEAGUES);
});

/**
 * FRB ids are plain numbers. Anything else used to be pasted into the upstream
 * URL and answered 200 with an empty list; it is a bad request.
 */
const FRB_ID = /^\d{1,9}$/;

function requireIds(req: { query: unknown }, res: { status: (code: number) => { json: (body: unknown) => void } }, names: string[], optional: string[] = []) {
    const query = req.query as Record<string, unknown>;
    const missing = names.filter((name) => typeof query[name] !== 'string' || !query[name]);
    if (missing.length) {
        res.status(400).json({ error: `${missing.join(' and ')} required` });
        return null;
    }
    const invalid = [...names, ...optional].filter((name) => query[name] != null && query[name] !== '' && !(typeof query[name] === 'string' && FRB_ID.test(query[name] as string)));
    if (invalid.length) {
        res.status(400).json({ error: `${invalid.join(' and ')} must be numeric FRB ids` });
        return null;
    }
    return query as Record<string, string>;
}

// ---------- GET /api/basketball/seasons?leagueId= ----------
router.get('/seasons', basketballProxyRateLimit, async (req, res) => {
    const query = requireIds(req, res, ['leagueId']);
    if (!query) return;
    const { leagueId } = query;

    try {
        const url = `https://widgets.baskethotel.com/widget-service/show?api=${getFrbApiKey()}&request[0][widget]=320&request[0][param][league_id]=${leagueId}`;
        const response = await axios.get(url, { headers: HEADERS, timeout: FRB_TIMEOUT_MS });
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
router.get('/teams', basketballProxyRateLimit, async (req, res) => {
    const query = requireIds(req, res, ['leagueId', 'seasonId']);
    if (!query) return;
    const { leagueId, seasonId } = query;

    try {
        const url = `https://widgets.baskethotel.com/widget-service/show?api=${getFrbApiKey()}&request[0][widget]=201&request[0][param][league_id][0]=${leagueId}&request[0][param][season_id]=${seasonId}&request[0][param][team_link_visible]=1&request[0][param][team_link_type]=3`;
        const response = await axios.get(url, { headers: HEADERS, timeout: FRB_TIMEOUT_MS });
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
router.get('/matches', basketballProxyRateLimit, async (req, res) => {
    const query = requireIds(req, res, ['teamId', 'seasonId', 'leagueId']);
    if (!query) return;
    const { teamId, seasonId, leagueId } = query;
    const month = typeof query.month === 'string' ? query.month : '';
    if (month && !/^\d{1,2}$/.test(month)) {
        res.status(400).json({ error: 'month must be 1-12' });
        return;
    }

    try {
        res.json(await fetchFrbMatches({ leagueId, seasonId, teamId, month: month || '' }));
    } catch (e) {
        console.error('[basketball/matches] error:', e);
        res.status(500).json({ error: 'Failed to fetch matches' });
    }
});

// ---------- GET /api/basketball/game?gameId=&seasonId= ----------
// "Fișă meci" — the per-game detail (quarters, referees, arena) that the
// /matches rows now carry a gameId for.
router.get('/game', basketballProxyRateLimit, async (req, res) => {
    const query = requireIds(req, res, ['gameId', 'seasonId']);
    if (!query) return;
    const { gameId, seasonId } = query;

    try {
        const detail = await fetchFrbGameDetail({ gameId, seasonId });
        if (!detail) {
            res.status(404).json({ error: 'Game not found' });
            return;
        }
        res.json(detail);
    } catch (e) {
        console.error('[basketball/game] error:', e);
        res.status(500).json({ error: 'Failed to fetch game detail' });
    }
});

// ---------- GET /api/basketball/standings?seasonId=&leagueId= ----------
router.get('/standings', basketballProxyRateLimit, async (req, res) => {
    const query = requireIds(req, res, ['seasonId', 'leagueId']);
    if (!query) return;
    const { seasonId, leagueId } = query;

    try {
        const baseUrl = `https://widgets.baskethotel.com/widget-service/show?api=${getFrbApiKey()}&lang=ro`;
        const initialUrl = `${baseUrl}&request[0][widget]=300&request[0][param][league_id]=${leagueId}&request[0][param][season_id]=${seasonId}&request[0][param][template]=v2&request[0][param][show_stage_selector]=1&request[0][param][stage_selector]=dropdown&request[0][param][use_group_sort_index]=1`;
        const initialResponse = await axios.get(initialUrl, { headers: HEADERS, timeout: FRB_TIMEOUT_MS });
        const initialRaw = String(initialResponse.data);
        const state = initialRaw.match(/state:\s*\\?'([^'\\]+)\\?'/)?.[1];
        const stageId = initialRaw.match(/activeStage\s*=\s*\\?'([^'\\]+)\\?'/)?.[1];

        if (!state) {
            res.json([]);
            return;
        }

        const tableUrl = `${baseUrl}&request[0][container]=standings&request[0][widget]=300&request[0][part]=table&request[0][state]=${encodeURIComponent(state)}&request[0][param][season_id]=${seasonId}${stageId ? `&request[0][param][group_filter]=${stageId}` : ''}&request[0][param][showTeamLogo]=&request[0][param][teamLogoSize]=20x20`;
        const tableResponse = await axios.get(tableUrl, { headers: HEADERS, timeout: FRB_TIMEOUT_MS });
        res.json(parseStandingsTable(String(tableResponse.data)));
    } catch (e) {
        console.error('[basketball/standings] error:', e);
        res.status(500).json({ error: 'Failed to fetch standings' });
    }
});

// ---------- GET /api/basketball/dashboard-summary ----------
// Agregă date din finance + players pentru KPI-uri dashboard
router.get('/dashboard-summary', basketballProxyRateLimit, async (_req, res) => {
    res.status(501).json({ message: 'Use /api/dashboard/summary instead' });
});

export default router;
