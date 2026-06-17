const https = require('https');
const fs = require('fs');

const KNOWN = {
  Thomsen: { gassoil: '10.500', diesel: null,    bensin: null,    updatedAt: '12/06/2026' },
  Magn:    { gassoil: '11.075', diesel: '10.520', bensin: '9.380', updatedAt: '17/06/2026' },
  Effo:    { gassoil: '11.075', diesel: '10.520', bensin: '9.380', updatedAt: '17/06/2026' }
};

function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: {
        'User-Agent': 'FaroePriceScraper/1.0',
        'Accept': 'text/html,*/*',
        'Accept-Language': 'fo,da;q=0.9'
      },
      timeout: 15000
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetchUrl(res.headers.location).then(resolve).catch(reject);
      }
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve(data));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
  });
}

async function scrapeThomsen() {
  try {
    const html = await fetchUrl('https://thomsen.fo/oljuprisur');
    const m = html.match(/DAGSPRISUR\s+([\d,\.]+)\s*kr/i)
               || html.match(/\b(10\.\d{3}|9\.\d{3}|11\.\d{3})\b/);
    const d = html.match(/(\d{1,2}[\.\-\/]\d{1,2}[\.\-\/]\d{4})/);
    if (m) {
      const val = parseFloat(m[1].replace(',', '.'));
      if (val > 5 && val < 20) {
        console.log('Thomsen OK:', val.toFixed(3));
        return { source: 'Thomsen', gassoil: val.toFixed(3), diesel: null, bensin: null, updatedAt: d ? d[1] : '' };
      }
    }
    throw new Error('Fann ikki pris');
  } catch(e) {
    console.log('Thomsen feilst:', e.message);
    return { source: 'Thomsen', ...KNOWN.Thomsen };
  }
}

async function scrapeMagn() {
  try {
    const html = await fetchUrl('https://www.magn.fo/oljuprisir');

    const dateMatch = html.match(/(\d{1,2})\s*\.\s*(january|february|march|april|may|june|july|august|september|october|november|december|januar|februar|mars|mai|juni|juli|september|oktober|november|desember)\s*(\d{4})/i);
    let updatedAt = '';
    if (dateMatch) {
      const mn = {january:'01',february:'02',march:'03',april:'04',may:'05',june:'06',july:'07',august:'08',september:'09',october:'10',november:'11',december:'12',
                  januar:'01',februar:'02',mars:'03',mai:'05',juni:'06',juli:'07',august:'08',september:'09',oktober:'10',november:'11',desember:'12'};
      updatedAt = dateMatch[1] + '/' + (mn[dateMatch[2].toLowerCase()]||'??') + '/' + dateMatch[3];
    }

    const nums = [];
    const re = /pricing_number[^>]*>([\d.]+)</g;
    let m;
    while ((m = re.exec(html)) !== null) {
      nums.push(parseFloat(m[1]));
    }

    const bensin = nums.length > 0 ? nums[0].toFixed(3) : null;
    const diesel = nums.length > 6 ? nums[6].toFixed(3) : null;

    let gassoil = null;
    const gasIdx = html.search(/>Gassolja</i);
    if (gasIdx > -1) {
      const gasSec = html.substring(gasIdx, gasIdx + 800);
      const gm = gasSec.match(/pricing_number[^>]*>([\d.]+)</);
      if (gm) gassoil = parseFloat(gm[1]).toFixed(3);
    }

    console.log('Magn:', { gassoil, diesel, bensin, updatedAt });

    if (gassoil && diesel && bensin &&
        parseFloat(gassoil) > 5 && parseFloat(diesel) > 5 && parseFloat(bensin) > 5) {
      return { source: 'Magn', gassoil, diesel, bensin, updatedAt };
    }
    throw new Error('Ogildur prisur: ' + JSON.stringify({gassoil, diesel, bensin}));
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

    const parts = html.split(/\d{1,2}\.\s+(?:apríl|mars|februar|januar|mai|juni|juli|august|september|oktober|november|desember)\s+\d{4}/i);
    const firstBlock = parts.length > 1 ? parts[1] : html;

    const bensinMatch = firstBlock.match(/(?:Blyfritt|Blyfridt|Bensin\s*95)[\s\S]{0,80}?([\d]+,[\d]+)\s*KR/i);
    const dieselMatch = firstBlock.match(/(?<!Bata)[Dd]iesel[\s\S]{0,50}?([\d]+,[\d]+)\s*KR/i);
    const gasMatch = firstBlock.match(/Gassolja[\s\S]{0,80}?([\d]+\.[\d]+),[\d]+\s*KR/i);

    const bensin = bensinMatch ? bensinMatch[1].replace(',', '.') : null;
    const diesel = dieselMatch ? dieselMatch[1].replace(',', '.') : null;
    let gassoil = null;
    if (gasMatch) {
      const raw = parseFloat(gasMatch[1].replace('.', ''));
      gassoil = (raw / 1000).toFixed(3);
    }

    console.log('Effo:', { gassoil, diesel, bensin, updatedAt });

    if (gassoil && diesel && bensin &&
        parseFloat(gassoil) > 5 && parseFloat(diesel) > 5 && parseFloat(bensin) > 5) {
      return { source: 'Effo', gassoil, diesel, bensin, updatedAt };
    }
    throw new Error('Ogildur prisur: ' + JSON.stringify({gassoil, diesel, bensin}));
  } catch(e) {
    console.log('Effo feilst:', e.message);
    return { source: 'Effo', ...KNOWN.Effo };
  }
}

async function main() {
  console.log('Byrjar at saekja prisir...', new Date().toISOString());

  const thomsen = await scrapeThomsen();
  const magn    = await scrapeMagn();
  const effo    = await scrapeEffo();

  const data = {
    updatedAt: new Date().toISOString(),
    sources: [thomsen, magn, effo]
  };

  fs.writeFileSync('prices-override.json', JSON.stringify(data, null, 2));
  console.log('Prisir goymdar:', JSON.stringify(data, null, 2));
}

main().catch(e => {
  console.error('Feilt:', e.message);
  process.exit(1);
});
