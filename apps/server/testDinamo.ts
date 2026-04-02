import axios from 'axios';

async function testDinamo() {
    const API_KEY = '9c3622c013ca2f69e8c373ecbf5af38e180f6d7d';
    const HEADERS = { Referer: 'https://www.frbaschet.ro/' };
    const teamId = 21485;
    
    // We try to request without league id or season id to see if it gives the full current season
    let url = `https://widgets.baskethotel.com/widget-service/show?api=${API_KEY}&lang=ro&request[0][widget]=200&request[0][part]=schedule_and_results&request[0][param][team_id]=${teamId}&request[0][param][month]=`;
    let res = await axios.get(url, { headers: HEADERS });
    console.log("No league/season provided:", res.data.length, "bytes");

    let htmlMatch = (res.data).match(/MBT\.API\.update\('.*?',\s*'([\s\S]*?)'\);/);
    if(htmlMatch) {
       console.log("Match found in HTML without league id!");
       let html = htmlMatch[1].replace(/\\n/g, '').replace(/\\"/g, '"').replace(/\\\//g, '/');
       const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
       let rowMatch;
       let count = 0;
       while ((rowMatch = rowRegex.exec(html)) !== null) {
          count++;
          if (count < 3) console.log(rowMatch[1].replace(/<[^>]*>/g, '').replace(/\\r|\\n/g, '').trim());
       }
       console.log("Rows found: ", count);
    } else {
        console.log("No widget html found. It requires league and season.");
    }
}
testDinamo();
