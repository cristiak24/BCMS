import { Router } from 'express';
import axios from 'axios';
import { authenticate } from '../middleware/auth';
import { rateLimit } from '../middleware/rateLimit';
import { FRB_HEADERS, getFrbApiKey } from '../lib/frbConfig';
import { fetchFrbMatches, stripTags } from '../lib/frbMatches';

const router = Router();

// Every endpoint below fans out to an upstream FRB widget service on our own API key
// and our own egress bill. Leaving them anonymous let the whole internet spend both,
// and gave away a working key to anyone who watched the traffic. This is federation
// reference data that only signed-in users have any reason to read, so authentication
// is enough — no role gate, since every role legitimately reads it.
router.use(authenticate);

const HEADERS = FRB_HEADERS;

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
router.get('/seasons', basketballProxyRateLimit, async (req, res) => {
    const { leagueId } = req.query as Record<string, string>;
    if (!leagueId) {
        res.status(400).json({ error: 'leagueId required' });
        return;
    }

    try {
        const url = `https://widgets.baskethotel.com/widget-service/show?api=${getFrbApiKey()}&request[0][widget]=320&request[0][param][league_id]=${leagueId}`;
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
router.get('/teams', basketballProxyRateLimit, async (req, res) => {
    const { leagueId, seasonId } = req.query as Record<string, string>;
    if (!leagueId || !seasonId) {
        res.status(400).json({ error: 'leagueId and seasonId required' });
        return;
    }

    try {
        const url = `https://widgets.baskethotel.com/widget-service/show?api=${getFrbApiKey()}&request[0][widget]=201&request[0][param][league_id][0]=${leagueId}&request[0][param][season_id]=${seasonId}&request[0][param][team_link_visible]=1&request[0][param][team_link_type]=3`;
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
router.get('/matches', basketballProxyRateLimit, async (req, res) => {
    const { teamId, seasonId, month, leagueId } = req.query as Record<string, string>;
    if (!teamId || !seasonId || !leagueId) {
        res.status(400).json({ error: 'teamId, seasonId and leagueId required' });
        return;
    }

    try {
        res.json(await fetchFrbMatches({ leagueId, seasonId, teamId, month: month || '' }));
    } catch (e) {
        console.error('[basketball/matches] error:', e);
        res.status(500).json({ error: 'Failed to fetch matches' });
    }
});

// ---------- GET /api/basketball/standings?seasonId=&leagueId= ----------
router.get('/standings', basketballProxyRateLimit, async (req, res) => {
    const { seasonId, leagueId } = req.query as Record<string, string>;
    if (!seasonId || !leagueId) {
        res.status(400).json({ error: 'seasonId and leagueId required' });
        return;
    }

    try {
        const baseUrl = `https://widgets.baskethotel.com/widget-service/show?api=${getFrbApiKey()}&lang=ro`;
        const initialUrl = `${baseUrl}&request[0][widget]=300&request[0][param][league_id]=${leagueId}&request[0][param][season_id]=${seasonId}&request[0][param][template]=v2&request[0][param][show_stage_selector]=1&request[0][param][stage_selector]=dropdown&request[0][param][use_group_sort_index]=1`;
        const initialResponse = await axios.get(initialUrl, { headers: HEADERS });
        const initialRaw = String(initialResponse.data);
        const state = initialRaw.match(/state:\s*\\?'([^'\\]+)\\?'/)?.[1];
        const stageId = initialRaw.match(/activeStage\s*=\s*\\?'([^'\\]+)\\?'/)?.[1];

        if (!state) {
            res.json([]);
            return;
        }

        const tableUrl = `${baseUrl}&request[0][container]=standings&request[0][widget]=300&request[0][part]=table&request[0][state]=${encodeURIComponent(state)}&request[0][param][season_id]=${seasonId}${stageId ? `&request[0][param][group_filter]=${stageId}` : ''}&request[0][param][showTeamLogo]=&request[0][param][teamLogoSize]=20x20`;
        const tableResponse = await axios.get(tableUrl, { headers: HEADERS });
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
