import axios from 'axios';

function cleanText(s) {
    if (!s) return '';
    return s.replace(/<[^>]*>/g, '')
            .replace(/\\r/g, '')
            .replace(/\\n/g, '')
            .replace(/\\t/g, '')
            .replace(/\\/g, '')
            .replace(/\r?\n|\r|\t/g, '')
            .replace(/\s+/g, ' ')
            .trim();
}

function parseFRBDate(dateStr) {
    if (!dateStr || dateStr.trim() === '') return null;
    const cleanStr = cleanText(dateStr);
    // If it has standard ISO-like format e.g., "2024-05-02 17:00"
    if (cleanStr.match(/\d{4}-\d{2}-\d{2}/)) {
        // Just convert space to T for reliable parsing
        const asIso = cleanStr.replace(' ', 'T') + ':00Z';
        const parsed = new Date(asIso);
        if (!isNaN(parsed.getTime())) return parsed;
    }

    const parts = cleanStr.split(' ');
    const dmy = parts[0].split('.');
    
    if (dmy.length === 3) {
        let time = parts.length > 1 && parts[parts.length - 1].includes(':') ? parts[parts.length - 1] : '12:00';
        const parsedDate = new Date(`${dmy[2]}-${dmy[1]}-${dmy[0]}T${time}:00Z`);
        if (!isNaN(parsedDate.getTime())) return parsedDate;
    }
    
    // Final fallback
    const fb = new Date(cleanStr);
    if (!isNaN(fb.getTime())) return fb;
    
    return null;
}

import { db } from './src/db';
import { teams } from './src/db/schema';

async function testIt() {
    const API_KEY = '9c3622c013ca2f69e8c373ecbf5af38e180f6d7d';
    const REFERER = 'https://www.frbaschet.ro/';
    const HEADERS = { Referer: REFERER };

    const allTeams = await db.select().from(teams);
    console.log(`testing ${allTeams.length} teams`);

    for (const team of allTeams) {
        if (!team.frbTeamId) continue;
        console.log(`Trying team ${team.name} frbTeamId: ${team.frbTeamId} frbLeagueId: ${team.frbLeagueId} season: ${team.frbSeasonId}`);
        const url = `https://widgets.baskethotel.com/widget-service/show?&api=${API_KEY}&lang=ro&request[0][widget]=200&request[0][part]=schedule_and_results&request[0][param][team_id]=${team.frbTeamId}&request[0][param][league_id]=${team.frbLeagueId}&request[0][param][season_id]=${team.frbSeasonId}&request[0][param][month]=`;
        const res = await axios.get(url, { headers: HEADERS });
        
        const htmlMatch = (res.data).match(/MBT\.API\.update\('.*?',\s*'([\s\S]*?)'\);/);
        if(!htmlMatch) {
            console.log("no match html");
            continue;
        }

        let html = htmlMatch[1].replace(/\\n/g, '').replace(/\\"/g, '"').replace(/\\\//g, '/');
        
        const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
        let rowMatch;
        while ((rowMatch = rowRegex.exec(html)) !== null) {
            const rowHtml = rowMatch[1];
            const cells = [];
            const cellReg = /<td[^>]*>([\s\S]*?)<\/td>/gi;
            let cellMatch;
            while ((cellMatch = cellReg.exec(rowHtml)) !== null) {
                cells.push(cleanText(cellMatch[1]));
            }

            if (cells.length >= 4 && cells[0].trim() !== '') {
                const dateStr = cells[0];
                const homeTeam = cells[1] || '';
                const awayTeam = cells[3] || '';
                if(!homeTeam && !awayTeam) continue;

                if (homeTeam.includes('Dinamo') || awayTeam.includes('Dinamo')) {
                    const parsedDate = parseFRBDate(dateStr);
                    console.log(`[DINAMO] Parsed Row -> DateStr: '${dateStr}' (Obj: ${parsedDate}) | Home: '${homeTeam}' | Away: '${awayTeam}'`);
                    console.log(`Raw cells: Date='${cells[0]}' Home='${cells[1]}' Score='${cells[2]}' Away='${cells[3]}'`);
                }
            }
        }
    }
    process.exit(0);
}
testIt();
