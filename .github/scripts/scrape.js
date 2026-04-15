const https = require('https');
const fs = require('fs');

const KNOWN = {
  Thomsen: { gassoil: '10.850', diesel: null,     bensin: null,     updatedAt: '15/04/2026' },
  Magn:    { gassoil: '12.313', diesel: '14.180',  bensin: '13.760', updatedAt: '14/04/2026' },
  Effo:    { gassoil: '12.313', diesel: '13.930',  bensin: '13.580', updatedAt: '13/04/2026' }
};

function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120',
        'Accept': 'text/html,*/*',
        'Accept-Language': 'fo,da;q=0.9'
      },
      timeout: 15000
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetchUrl(res.headers.location).then(resolve).catch(reject);
      }
      let data = '';
    : Scrape oljuprísir

on:
  schedule:
    - cron: '0 */6 * * *'
  workflow_dispatch:

jobs:
  scrape:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Scrape prices
        run: node .github/scripts/scrape.js

      - name: Commit prices
        run: |
          git config user.name "Prísvakt Bot"
          git config user.email "bot@prisvakt.fo"
          git add prices-override.json
          git diff --staged --quiet && echo "Eingi broytingar" && exit 0
          git commit -m "Uppfær prísir $(date '+%d/%m/%Y %H:%M')"
          git pull --rebase -X ours origin main || {
            git rebase --abort
            git pull origin main
            git checkout --theirs prices-override.json
            git add prices-override.json
            git commit -m "Merge conflict resolved - keeping latest from main"
          }
          git push origin main
    const html = await fetchUrl('https://thomsen.fo/oljuprisur');
    const m = html.match(/DAGSPRÍSUR\s+([\d,\.]+)\s*kr/i)
           || html.match(/\b(10\.\d{3}|9\.\d{3}|11\.\d{3})\b/);
    const d = html.match(/(\d{1,2}[\.\-\/]\d{1,2}[\.\-\/]\d{4})/);
    if (m) {
      const val = parseFloat(m[1].replace(',', '.'));
      if (val > 5 && val < 20) {
        console.log('Thomsen OK:', val.toFixed(3));
        return { source: 'Thomsen', gassoil: val.toFixed(3), diesel: null, bensin: null, updatedAt: d ? d[1] : '' };
      }
    }
    throw new Error('Fann ikki prís');
  } catch(e) {
    console.log('Thomsen feilst:', e.message);
    return { source: 'Thomsen', ...KNOWN.Thomsen };
  }
}

async function scrapeMagn() {
  try {
    const html = await fetchUrl('https://www.magn.fo/oljuprisir');

    // Magn Webflow HTML - prísir eru í markdown format:
    // "## 13.760" eftir "Bensin"
    // "## 14.180" eftir "Diesel"  
    // "## 12.313" eftir "Gassolja"

    // Dato: "## 14\n## .\n## April\n## 2026"
    const dateMatch = html.match(/##\s*(\d{1,2})\s*##\s*\.\s*##\s*(January|February|March|April|May|June|July|August|September|October|November|December)\s*##\s*(\d{4})/i)
      || html.match(/(\d{1,2})\s*\.\s*(January|February|March|April|May|June|July|August|September|October|November|December)\s*(\d{4})/i);
    
    let updatedAt = '';
    if (dateMatch) {
      const mn = {january:'01',february:'02',march:'03',april:'04',may:'05',june:'06',july:'07',august:'08',september:'09',october:'10',november:'11',december:'12'};
      updatedAt = dateMatch[1] + '/' + (mn[dateMatch[2].toLowerCase()]||'??') + '/' + dateMatch[3];
    }

    // Find prísir - Magn sýnir "kr.\n\n13.760" format í HTML
    // Men í markdown format eru tær sum "## 13.760"
    
    // Leita eftir Bensin prís - fyrsti prísur eftir "Bensin" label
    // Bensin kemur áðrenn Diesel í Magn's síðu
    const bensinMatch = html.match(/Bensin[\s\S]{0,300}?kr\.\s*\n\s*\n?\s*(1[0-9]\.\d{3})/)
      || html.match(/Bensin\b[\s\S]{0,200}?>\s*(1[0-9]\.\d{3})\s*</)
      || html.match(/Bensin[\s\S]{0,100}?(1[3-5]\.\d{3})/);

    const dieselMatch = html.match(/Diesel\b[\s\S]{0,300}?kr\.\s*\n\s*\n?\s*(1[0-9]\.\d{3})/)
      || html.match(/Diesel\b[\s\S]{0,200}?>\s*(1[0-9]\.\d{3})\s*</)
      || html.match(/(?<!Báta)Diesel[\s\S]{0,100}?(1[3-5]\.\d{3})/);

    const gasMatch = html.match(/Gassolja[\s\S]{0,300}?kr\.\s*\n\s*\n?\s*(1[0-2]\.\d{3})/)
      || html.match(/Gassolja[\s\S]{0,200}?>\s*(1[0-2]\.\d{3})\s*</)
      || html.match(/Gassolja[\s\S]{0,200}?(1[0-2]\.\d{3})/);

    const bensin  = bensinMatch  ? bensinMatch[1]  : null;
    const diesel  = dieselMatch  ? dieselMatch[1]  : null;
    const gassoil = gasMatch     ? gasMatch[1]     : null;

    // Fallback: finn øll XX.XXX tal og sortera
    if (!bensin || !diesel || !gassoil) {
      const allNums = [...html.matchAll(/\b(1[0-9]\.\d{3})\b/g)]
        .map(m => parseFloat(m[1]))
        .filter((v,i,a) => a.indexOf(v) === i) // unique
        .sort((a,b) => b-a);
      
      console.log('Magn øll tal:', allNums);
      
      // Bensin = størsta tal (13-16 kr)
      // Diesel = næsta
      // Gassolja = minsta (11-13 kr)
      const candidates = allNums.filter(v => v >= 11 && v <= 16);
      
      if (candidates.length >= 2) {
        const b = bensin || candidates[0].toFixed(3);
        const d = diesel || candidates[1].toFixed(3);
        const g = gassoil || candidates[candidates.length-1].toFixed(3);
        
        console.log('Magn (fallback):', { gassoil: g, diesel: d, bensin: b, updatedAt });
        return { source: 'Magn', gassoil: g, diesel: d, bensin: b, updatedAt };
      }
    }

    console.log('Magn:', { gassoil, diesel, bensin, updatedAt });

    if (gassoil && diesel && bensin && 
        parseFloat(gassoil) > 5 && parseFloat(diesel) > 5 && parseFloat(bensin) > 5) {
      return { source: 'Magn', gassoil, diesel, bensin, updatedAt };
    }
    throw new Error('Ógildur prísur: ' + JSON.stringify({gassoil, diesel, bensin}));
  } catch(e) {
    console.log('Magn feilst:', e.message);
    return { source: 'Magn', ...KNOWN.Magn };
  }
}

async function scrapeEffo() {
  try {
    const html = await fetchUrl('https://www.effo.fo/prisir/');

    const dateMatch = html.match(/(\d{1,2})\.\s+(apríl|mars|februar|januar|mai|juni|juli|august|september|oktober|november|desember)\s+(\d{4})/i);
    let updatedAt = '';
    if (dateMatch) {
      updatedAt = dateMatch[1] + '/' + dateMatch[2].substring(0,3) + '/' + dateMatch[3];
    }

    const bensinMatch = html.match(/Blýfrítt[^|]*\|\s*([\d,]+)\s*KR/i);
    const dieselMatch = html.match(/\|\s*Diesel\s*\|\s*([\d,]+)\s*KR/i);
    const gasMatch    = html.match(/Gassolja[^|]*\|\s*([\d,\.]+)\s*KR/i);

    const bensin  = bensinMatch ? bensinMatch[1].replace(',', '.') : null;
    const diesel  = dieselMatch ? dieselMatch[1].replace(',', '.') : null;
    let gassoil = null;
    if (gasMatch) {
      const raw = parseFloat(gasMatch[1].replace(',', '.'));
      gassoil = raw > 100 ? (raw/1000).toFixed(3) : raw.toFixed(3);
    }

    console.log('Effo:', { gassoil, diesel, bensin, updatedAt });

    if (gassoil && diesel && bensin &&
        parseFloat(gassoil) > 5 && parseFloat(diesel) > 5 && parseFloat(bensin) > 5) {
      return { source: 'Effo', gassoil, diesel, bensin, updatedAt };
    }
    throw new Error('Ógildur prísur');
  } catch(e) {
    console.log('Effo feilst:', e.message);
    return { source: 'Effo', ...KNOWN.Effo };
  }
}

async function main() {
  console.log('Byrjar at sækja prísir...', new Date().toISOString());

  const thomsen = await scrapeThomsen();
  const magn    = await scrapeMagn();
  const effo    = await scrapeEffo();

  const data = {
    updatedAt: new Date().toISOString(),
    sources: [thomsen, magn, effo]
  };

  fs.writeFileSync('prices-override.json', JSON.stringify(data, null, 2));
  console.log('Prísir goymdar:', JSON.stringify(data, null, 2));
}

main().catch(e => {
  console.error('Feilt:', e.message);
  process.exit(1);
});
