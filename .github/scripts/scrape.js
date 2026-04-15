const puppeteer = require('puppeteer');
const fs = require('fs');

const KNOWN = {
  Thomsen: { gassoil: '10.850', diesel: null,     bensin: null,     updatedAt: '15/04/2026' },
  Magn:    { gassoil: '12.313', diesel: '14.360',  bensin: '14.700', updatedAt: '09/04/2026' },
  Effo:    { gassoil: '12.313', diesel: '13.930',  bensin: '13.580', updatedAt: '13/04/2026' }
};

async function scrapeThomsen(browser) {
  const page = await browser.newPage();
  try {
    await page.goto('https://thomsen.fo/oljuprisur', { waitUntil: 'domcontentloaded', timeout: 20000 });
    const result = await page.evaluate(() => {
      const allText = document.body.innerText;
      const m = allText.match(/DAGSPRÍSUR\s+([\d,\.]+)\s*kr/i)
             || allText.match(/\b(10\.\d{3}|9\.\d{3}|11\.\d{3})\b/);
      const d = allText.match(/(\d{1,2}[\.\-\/]\d{1,2}[\.\-\/]\d{4})/);
      return m ? { gassoil: m[1].replace(',','.'), updatedAt: d ? d[1] : '' } : null;
    });
    if (result && parseFloat(result.gassoil) > 5) {
      console.log('Thomsen OK:', result.gassoil);
      return { source: 'Thomsen', gassoil: parseFloat(result.gassoil).toFixed(3), diesel: null, bensin: null, updatedAt: result.updatedAt };
    }
    throw new Error('Fann ikki prís');
  } catch(e) {
    console.log('Thomsen feilst:', e.message);
    return { source: 'Thomsen', ...KNOWN.Thomsen };
  } finally { await page.close(); }
}

async function scrapeMagn(browser) {
  const page = await browser.newPage();
  try {
    // Sett longer timeout og bíð eftir at Webflow JS renderar
    await page.goto('https://www.magn.fo/oljuprisir', { waitUntil: 'networkidle0', timeout: 45000 });
    
    // Bíð eftir at prísir eru sýniligir - Webflow tekur tíð
    await new Promise(r => setTimeout(r, 5000));

    const result = await page.evaluate(() => {
      const allText = document.body.innerText;
      const lines = allText.split('\n').map(l => l.trim()).filter(Boolean);
      
      console.log('Magn fyrstu 50 linjur:', lines.slice(0, 50).join(' | '));

      let bensin = null, diesel = null, gassoil = null, updatedAt = '';

      // Finn dato
      const dateMatch = allText.match(/(\d{1,2})\s*\.\s*(January|February|March|April|May|June|July|August|September|October|November|December)\s*(\d{4})/i);
      if (dateMatch) {
        const mn = {january:'01',february:'02',march:'03',april:'04',may:'05',june:'06',july:'07',august:'08',september:'09',october:'10',november:'11',december:'12'};
        updatedAt = dateMatch[1] + '/' + (mn[dateMatch[2].toLowerCase()]||'??') + '/' + dateMatch[3];
      }

      // Finn alle XX.XXX tal
      const allPrices = [...allText.matchAll(/\b(1[0-9]\.\d{3})\b/g)].map(m => parseFloat(m[1]));
      const unique = [...new Set(allPrices)].sort((a,b) => b-a);
      console.log('Magn allir prísir:', unique);

      // Magn sýnir: Bensin (hægst), Bensin oktan 98, Diesel, Bátadiesel+, Bátadiesel, Gassolja
      // Við MVG prísir eru hægri - vit vilja "Við MVG" prísirnar
      // Bensin = størsta tal yvir 14
      // Diesel = næsta tal
      // Gassolja = tal millum 11-13

      const bensinCandidates = unique.filter(v => v >= 14 && v <= 16);
      const dieselCandidates = unique.filter(v => v >= 13 && v < 15);
      const gassoilCandidates = unique.filter(v => v >= 11 && v < 14);

      if (bensinCandidates.length) bensin = bensinCandidates[0].toFixed(3);
      if (dieselCandidates.length) diesel = dieselCandidates[0].toFixed(3);
      if (gassoilCandidates.length) gassoil = gassoilCandidates[gassoilCandidates.length-1].toFixed(3);

      // Prova at finna prísir við label-matching
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].toLowerCase();
        // Leita eftir prístalvum í næstu linjum
        for (let j = i+1; j <= Math.min(i+5, lines.length-1); j++) {
          const priceMatch = lines[j].match(/^(1[0-9]\.\d{3})$/);
          if (!priceMatch) continue;
          const val = parseFloat(priceMatch[1]);
          if (line.includes('bensin') && !line.includes('oktan') && !bensin) bensin = val.toFixed(3);
          else if (line.includes('diesel') && !line.includes('báta') && !diesel) diesel = val.toFixed(3);
          else if (line.includes('gassolja') && !gassoil) gassoil = val.toFixed(3);
        }
      }

      return { bensin, diesel, gassoil, updatedAt };
    });

    console.log('Magn result:', result);

    if (result.gassoil && parseFloat(result.gassoil) > 5 &&
        result.diesel && parseFloat(result.diesel) > 5 &&
        result.bensin && parseFloat(result.bensin) > 5) {
      return { source: 'Magn', gassoil: result.gassoil, diesel: result.diesel, bensin: result.bensin, updatedAt: result.updatedAt };
    }
    throw new Error('Ógildur prísur: ' + JSON.stringify(result));
  } catch(e) {
    console.log('Magn feilst:', e.message);
    return { source: 'Magn', ...KNOWN.Magn };
  } finally { await page.close(); }
}

async function scrapeEffo(browser) {
  const page = await browser.newPage();
  try {
    await page.goto('https://www.effo.fo/prisir/', { waitUntil: 'networkidle0', timeout: 45000 });
    await new Promise(r => setTimeout(r, 3000));

    const result = await page.evaluate(() => {
      const allText = document.body.innerText;

      const dateMatch = allText.match(/(\d{1,2})\.\s+(apríl|mars|februar|januar|mai|juni|juli|august|september|oktober|november|desember)\s+(\d{4})/i);
      let updatedAt = '';
      if (dateMatch) {
        updatedAt = dateMatch[1] + '/' + dateMatch[2].substring(0,3) + '/' + dateMatch[3];
      }

      const bensinMatch = allText.match(/Blýfrítt\s+([\d,]+)\s*KR/i);
      const dieselMatch = allText.match(/(?<!\w)Diesel\s+([\d,]+)\s*KR/i);
      const gasMatch    = allText.match(/Gassolja\s+([\d,\.]+)\s*KR/i);

      const bensin = bensinMatch ? bensinMatch[1].replace(',','.') : null;
      const diesel = dieselMatch ? dieselMatch[1].replace(',','.') : null;
      let gassoil = null;
      if (gasMatch) {
        const raw = parseFloat(gasMatch[1].replace(',','.'));
        gassoil = raw > 100 ? (raw/1000).toFixed(3) : raw.toFixed(3);
      }

      return { bensin, diesel, gassoil, updatedAt };
    });

    console.log('Effo result:', result);

    if (result.gassoil && parseFloat(result.gassoil) > 5 &&
        result.diesel && parseFloat(result.diesel) > 5 &&
        result.bensin && parseFloat(result.bensin) > 5) {
      return { source: 'Effo', gassoil: result.gassoil, diesel: result.diesel, bensin: result.bensin, updatedAt: result.updatedAt };
    }
    throw new Error('Ógildur prísur: ' + JSON.stringify(result));
  } catch(e) {
    console.log('Effo feilst:', e.message);
    return { source: 'Effo', ...KNOWN.Effo };
  } finally { await page.close(); }
}

async function main() {
  console.log('Byrjar at sækja prísir...', new Date().toISOString());

  const browser = await puppeteer.launch({
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
  });

  try {
    // Scrape ein um eitt - ikki parallel - so Magn fær nóg tíð
    const thomsen = await scrapeThomsen(browser);
    const magn = await scrapeMagn(browser);
    const effo = await scrapeEffo(browser);

    const data = {
      updatedAt: new Date().toISOString(),
      sources: [thomsen, magn, effo]
    };

    fs.writeFileSync('prices-override.json', JSON.stringify(data, null, 2));
    console.log('Prísir goymdar:', JSON.stringify(data, null, 2));

  } finally {
    await browser.close();
  }
}

main().catch(e => {
  console.error('Feilt:', e.message);
  process.exit(1);
});
