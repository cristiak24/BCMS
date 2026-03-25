import { Router } from 'express';
import axios from 'axios';

const router = Router();

const API_KEY = '9c3622c013ca2f69e8c373ecbf5af38e180f6d7d';
const REFERER = 'https://www.frbaschet.ro/';
const HEADERS = { Referer: REFERER };

// ---------- Helpers ----------

function parseScore(rawScore: string): { home: string; away: string } {
    const clean = rawScore.replace(/\s+/g, '');
    const parts = clean.split('-');
    return { home: parts[0] || '?', away: parts[1] || '?' };
}

function determineResult(homeTeamName: string, homeScore: string, awayScore: string): 'W' | 'L' | 'N/A' {
    const h = parseInt(homeScore, 10);
    const a = parseInt(awayScore, 10);
    if (isNaN(h) || isNaN(a)) return 'N/A';
    return h > a ? 'W' : 'L';
}

// ---------- GET /api/basketball/leagues ----------
router.get('/leagues', (_req, res) => {
    // Static for now — add more leagues here as needed
    res.json([
        { id: '25493', name: 'LNBM' },
        { id: '25523', name: 'Liga 1' },
    ]);
});

// ---------- GET /api/basketball/seasons?leagueId= ----------
router.get('/seasons', async (req, res) => {
    const { leagueId } = req.query as Record<string, string>;
    if (!leagueId) { res.status(400).json({ error: 'leagueId required' }); return; }

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
    if (!leagueId || !seasonId) { res.status(400).json({ error: 'leagueId and seasonId required' }); return; }

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
        
        // Deduplicate teams by ID
        const uniqueTeams = Array.from(new Map(teams.map((t) => [t.id, t])).values());

        res.json(uniqueTeams);
    } catch (e) {
        console.error('[basketball/teams] error:', e);
        res.status(500).json({ error: 'Failed to fetch teams' });
    }
});

// ---------- GET /api/basketball/matches?teamId=&seasonId=&month=&leagueId= ----------
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
        if (!htmlMatch) { res.json([]); return; }

        let html = htmlMatch[1]
            .replace(/\\n/g, '')
            .replace(/\\"/g, '"')
            .replace(/\\\//g, '/');

        // Parse table rows from HTML string
        const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
        const cellRegex = /<td[^>]*>([\s\S]*?)<\/td>/gi;
        const stripTags = (s: string) => s.replace(/<[^>]*>/g, '').trim();

        const matches: {
            date: string;
            homeTeam: string;
            awayTeam: string;
            homeScore: string;
            awayScore: string;
            result: string;
            league: string;
        }[] = [];

        let rowMatch: RegExpExecArray | null;
        while ((rowMatch = rowRegex.exec(html)) !== null) {
            const rowHtml = rowMatch[1];
            const cells: string[] = [];
            let cellMatch: RegExpExecArray | null;
            const cellReg = /<td[^>]*>([\s\S]*?)<\/td>/gi;
            while ((cellMatch = cellReg.exec(rowHtml)) !== null) {
                cells.push(stripTags(cellMatch[1]));
            }

            if (cells.length >= 4 && cells[0].trim() !== '') {
                const score = parseScore(cells[2] || '');
                const result = determineResult(cells[1], score.home, score.away);
                matches.push({
                    date: cells[0].trim(),
                    homeTeam: cells[1]?.trim() || '',
                    awayTeam: cells[3]?.trim() || '',
                    homeScore: score.home,
                    awayScore: score.away,
                    result,
                    league: cells[4]?.trim() || '',
                });
            }
        }

        res.json(matches);
    } catch (e) {
        console.error('[basketball/matches] error:', e);
        res.status(500).json({ error: 'Failed to fetch matches' });
    }
});

export default router;
