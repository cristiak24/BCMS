"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const axios_1 = __importDefault(require("axios"));
const router = (0, express_1.Router)();
const API_KEY = '9c3622c013ca2f69e8c373ecbf5af38e180f6d7d';
const REFERER = 'https://www.frbaschet.ro/';
const HEADERS = { Referer: REFERER };
// ---------- Helpers ----------
function parseScore(rawScore) {
    const clean = rawScore.replace(/\s+/g, '');
    const parts = clean.split('-');
    return { home: parts[0] || '?', away: parts[1] || '?' };
}
function determineResult(homeTeamName, homeScore, awayScore) {
    const h = parseInt(homeScore, 10);
    const a = parseInt(awayScore, 10);
    if (isNaN(h) || isNaN(a))
        return 'N/A';
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
router.get('/seasons', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { leagueId } = req.query;
    if (!leagueId) {
        res.status(400).json({ error: 'leagueId required' });
        return;
    }
    try {
        const url = `https://widgets.baskethotel.com/widget-service/show?api=${API_KEY}&request[0][widget]=320&request[0][param][league_id]=${leagueId}`;
        const response = yield axios_1.default.get(url, { headers: HEADERS });
        const cleanData = response.data.replace(/\\"/g, '"').replace(/\\\//g, '/');
        const regex = /value="(\d{5,7})"[^>]*>(\d{4}-\d{4})/g;
        const seasons = [];
        let match;
        while ((match = regex.exec(cleanData)) !== null) {
            seasons.push({ id: match[1], text: match[2] });
        }
        res.json(seasons);
    }
    catch (e) {
        console.error('[basketball/seasons] error:', e);
        res.status(500).json({ error: 'Failed to fetch seasons' });
    }
}));
// ---------- GET /api/basketball/teams?leagueId=&seasonId= ----------
router.get('/teams', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { leagueId, seasonId } = req.query;
    if (!leagueId || !seasonId) {
        res.status(400).json({ error: 'leagueId and seasonId required' });
        return;
    }
    try {
        const url = `https://widgets.baskethotel.com/widget-service/show?api=${API_KEY}&request[0][widget]=201&request[0][param][league_id][0]=${leagueId}&request[0][param][season_id]=${seasonId}&request[0][param][team_link_visible]=1&request[0][param][team_link_type]=3`;
        const response = yield axios_1.default.get(url, { headers: HEADERS });
        const raw = response.data.replace(/\\/g, '');
        const teams = [];
        const regexWithId = /team_id="(\d+)"[^>]*>(.*?)<\/a>/g;
        let match;
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
    }
    catch (e) {
        console.error('[basketball/teams] error:', e);
        res.status(500).json({ error: 'Failed to fetch teams' });
    }
}));
// ---------- GET /api/basketball/matches?teamId=&seasonId=&month=&leagueId= ----------
router.get('/matches', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c;
    const { teamId, seasonId, month, leagueId } = req.query;
    if (!teamId || !seasonId || !leagueId) {
        res.status(400).json({ error: 'teamId, seasonId and leagueId required' });
        return;
    }
    try {
        const url = `https://widgets.baskethotel.com/widget-service/show?&api=${API_KEY}&lang=ro&request[0][widget]=200&request[0][part]=schedule_and_results&request[0][param][team_id]=${teamId}&request[0][param][league_id]=${leagueId}&request[0][param][season_id]=${seasonId}&request[0][param][month]=${month || ''}`;
        const response = yield axios_1.default.get(url, { headers: HEADERS });
        const htmlMatch = response.data.match(/MBT\.API\.update\('.*?',\s*'([\s\S]*?)'\);/);
        if (!htmlMatch) {
            res.json([]);
            return;
        }
        let html = htmlMatch[1]
            .replace(/\\n/g, '')
            .replace(/\\"/g, '"')
            .replace(/\\\//g, '/');
        // Parse table rows from HTML string
        const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
        const cellRegex = /<td[^>]*>([\s\S]*?)<\/td>/gi;
        const stripTags = (s) => s.replace(/<[^>]*>/g, '').trim();
        const matches = [];
        let rowMatch;
        while ((rowMatch = rowRegex.exec(html)) !== null) {
            const rowHtml = rowMatch[1];
            const cells = [];
            let cellMatch;
            const cellReg = /<td[^>]*>([\s\S]*?)<\/td>/gi;
            while ((cellMatch = cellReg.exec(rowHtml)) !== null) {
                cells.push(stripTags(cellMatch[1]));
            }
            if (cells.length >= 4 && cells[0].trim() !== '') {
                const score = parseScore(cells[2] || '');
                const result = determineResult(cells[1], score.home, score.away);
                matches.push({
                    date: cells[0].trim(),
                    homeTeam: ((_a = cells[1]) === null || _a === void 0 ? void 0 : _a.trim()) || '',
                    awayTeam: ((_b = cells[3]) === null || _b === void 0 ? void 0 : _b.trim()) || '',
                    homeScore: score.home,
                    awayScore: score.away,
                    result,
                    league: ((_c = cells[4]) === null || _c === void 0 ? void 0 : _c.trim()) || '',
                });
            }
        }
        res.json(matches);
    }
    catch (e) {
        console.error('[basketball/matches] error:', e);
        res.status(500).json({ error: 'Failed to fetch matches' });
    }
}));
exports.default = router;
