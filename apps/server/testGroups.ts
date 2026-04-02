import axios from 'axios';

async function testGroups() {
    const API_KEY = '9c3622c013ca2f69e8c373ecbf5af38e180f6d7d';
    const HEADERS = { Referer: 'https://www.frbaschet.ro/' };
    const teamId = 21842;
    const leagueId = 25493;
    const seasonId = 131194;
    
    // Explicitly add month=all for "Toate lunile"
    for (const grp of ['', '0', 'all', '1', '2', '3', '4', '5']) {
        let url = `https://widgets.baskethotel.com/widget-service/show?api=${API_KEY}&lang=ro&request[0][widget]=200&request[0][part]=schedule_and_results&request[0][param][team_id]=${teamId}&request[0][param][league_id]=${leagueId}&request[0][param][season_id]=${seasonId}&request[0][param][month]=all&request[0][param][group_id]=${grp}`;
        let res = await axios.get(url, { headers: HEADERS });
        let htmlMatch = res.data.match(/MBT\.API\.update\('.*?',\s*'([\s\S]*?)'\);/);
        if(htmlMatch) {
           let html = htmlMatch[1].replace(/\\n/g, '').replace(/\\"/g, '"').replace(/\\\//g, '/');
           const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
           let count = 0;
           let rowMatch;
           while ((rowMatch = rowRegex.exec(html)) !== null) { count++; }
           console.log(`group_id='${grp}' -> Found ${count} rows!`);
        } else {
           console.log(`group_id='${grp}' -> No widget html!`);
        }
    }
}
testGroups();
