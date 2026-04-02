import axios from 'axios';

async function findSeason() {
    const API_KEY = '9c3622c013ca2f69e8c373ecbf5af38e180f6d7d';
    const HEADERS = { Referer: 'https://www.frbaschet.ro/' };
    
    let url = `https://widgets.baskethotel.com/widget-service/show?api=${API_KEY}&request[0][widget]=320&request[0][param][league_id]=25493`;
    let res = await axios.get(url, { headers: HEADERS });
    
    let cleanData = res.data.replace(/\\"/g, '"').replace(/\\\//g, '/');
    let regex = /value="(\d+)"[^>]*>(\d{4}-\d{4})/g;
    let match;
    while((match = regex.exec(cleanData))) {
        console.log(`Season: ${match[1]} Text: ${match[2]}`);
    }
}
findSeason();
