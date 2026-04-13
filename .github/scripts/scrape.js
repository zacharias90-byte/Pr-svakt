const puppeteer = require('puppeteer');
const fs = require('fs');

const KNOWN = {
  Thomsen: { gassoil: '10.350', diesel: null,     bensin: null,     updatedAt: '09/04/2026' },
  Magn:    { gassoil: '12.313', diesel: '14.360',  bensin: '14.700', updatedAt: '09/04/2026' },
  Effo:    { gassoil: '12.000', diesel: '14.050',  bensin: '14.200', updatedAt: '09/04/2026' }
};

async function scrapeThomsen(page) {
  try {
    await page.goto('https://thomsen.fo/oljuprisur', { waitUntil: 'domcontentloaded', timeout: 20000 });
    const result = await page.evaluate(() => {
      const h2s = Array.from(document.querySelectorAll('h2'));
      for (const h2 of h2s) {
        const m = h2.textContent.match(/DAGSPRÍSUR\s+([\d,\.]+)\s*kr/i);
        if (m) return { gassoil: m[1].replace(',', '.') };
      }
      // Prøv andre selectors
      const allText = document.body.innerText;
      const m = allText.match(/DAGSPRÍSUR\s+([\d,\.]+)\s*kr/i)
             || allText.match(/\b(10\.\d{3}|9\.\d{3}|11\.\d{3})\b/);
      return m ? { gassoil: m[1].replace(',', '.') } : null;
    });
    if (result && parseFloat(result.gassoil) > 5) {
      console.log('Thomsen OK:', result.gassoil);
      return { source: 'Thomsen', gassoil: parseFloat(result.gassoil).toFixed(3), diesel: null, bensin: null, updatedAt: new Date().toLocaleDateString('da-DK') };
    }
    throw new Error('Fann ikki prís');
  } catch(e) {
    console.log('Thomsen feilst:', e.message);
    return { source: 'Thomsen', ...KNOWN.Thomsen };
  }
}

async function scrapeMagn(page) {
  try {
    await page.goto('https://www.magn.fo/oljuprisir', { waitUntil: 'networkidle2', timeout: 30000 });
    await new Promise(r => setTimeout(r, 3000));

    const result = await page.evaluate(() => {
      // Magn Webflow - leita eftir prístalvum í síðuni
      const allText = document.body.innerText;
      const lines = allText.split('\n').map(l => l.trim()).filter(Boolean);

      let bensin = null, diesel = null, gassoil = null, updatedAt = '';

      // Finn dato
      const dateMatch = allText.match(/(\d{1,2})\s*\.\s*(January|February|March|April|May|June|July|August|September|October|November|December)\s*(\d{4})/i);
      if (dateMatch) {
        const months = {january:'01',february:'02',march:'03',april:'04',may:'05',june:'06',july:'07',august:'08',september:'09',october:'10',november:'11',december:'12'};
        updatedAt = dateMatch[1] + '/' + (months[dateMatch[2].toLowerCase()]||'??') + '/' + dateMatch[3];
      }

      // Finn prísir - leita eftir tal eftir label
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const nextLine = lines[i+1] || '';
        const priceMatch = nextLine.match(/^(1[0-9]\.\d{3})$/) || line.match(/kr\.\s*(1[0-9]\.\d{3})/);
        if (!priceMatch) continue;
        const price = priceMatch[1];

        if (line.toLowerCase().includes('bensin') && !line.toLowerCase().includes('oktan') && !bensin) {
          bensin = price;
        } else if (line.toLowerCase().includes('diesel') && !line.toLowerCase().includes('báta') && !diesel) {
          diesel = price;
        } else if (line.toLowerCase().includes('gassolja') && !gassoil) {
          gassoil = price;
        }
      }

      // Fallback - finn alle XX.XXX tal og brul tey
      if (!bensin || !diesel || !gassoil) {
        const allPrices = [...allText.matchAll(/\b(1[0-9]\.\d{3})\b/g)].map(m => m[1]);
        const unique = [...new Set(allPrices)].map(parseFloat).sort((a,b) => b-a);
        console.log('Magn alle prísir:', unique);
        // Størsta = bensin, næststørsta = diesel, minsta = gassolja
        if (unique.length >= 2) {
          if (!bensin && unique[0]) bensin = unique[0].toFixed(3);
          if (!diesel && unique[1]) diesel = unique[1].toFixed(3);
          if (!gassoil) {
            const gasVals = unique.filter(v => v < 13);
            if (gasVals.length) gassoil = gasVals[0].toFixed(3);
          }
        }
      }

      return { bensin, diesel, gassoil, updatedAt };
    });

    console.log('Magn result:', result);
    if (result.gassoil && parseFloat(result.gassoil) > 5 && result.diesel && result.bensin) {
      return { source: 'Magn', gassoil: result.gassoil, diesel: result.diesel, bensin: result.bensin, updatedAt: result.updatedAt };
    }
    throw new Error('Ógildur prísur: ' + JSON.stringify(result));
  } catch(e) {
    console.log('Magn feilst:', e.message);
    return { source: 'Magn', ...KNOWN.Magn };
  }
}

async function scrapeEffo(page) {
  try {
    await page.goto('https://www.effo.fo/prisir/', { waitUntil: 'networkidle2', timeout: 30000 });
    await new Promise(r => setTimeout(r, 3000));

    const result = await page.evaluate(() => {
      const allText = document.body.innerText;

      // Finn dato
      const dateMatch = allText.match(/(\d{1,2})\.\s+(apríl|mars|februar|januar|mai|juni|juli|august|september|oktober|november|desember)\s+(\d{4})/i);
      let updatedAt = '';
      if (dateMatch) {
        updatedAt = dateMatch[1] + '/' + dateMatch[2].substring(0,3) + '/' + dateMatch[3];
      }

      // Finn prísir úr tabellum
      let bensin = null, diesel = null, gassoil = null;

      // Effo tabell: "Blýfrítt 14,70 KR."
      const bensinMatch = allText.match(/Blýfrítt\s+([\d,]+)\s*KR/i);
      const dieselMatch = allText.match(/(?<!\w)Diesel\s+([\d,]+)\s*KR/i);
      const gasMatch    = allText.match(/Gassolja\s+([\d,\.]+)\s*KR/i);

      if (bensinMatch) bensin = bensinMatch[1].replace(',','.');
      if (dieselMatch) diesel = dieselMatch[1].replace(',','.');
      if (gasMatch) {
        const raw = parseFloat(gasMatch[1].replace(',','.'));
        gassoil = raw > 100 ? (raw/1000).toFixed(3) : raw.toFixed(3);
      }

      return { bensin, diesel, gassoil, updatedAt };
    });

    console.log('Effo result:', result);
    if (result.gassoil && parseFloat(result.gassoil) > 5 && result.diesel && result.bensin) {
      return { source: 'Effo', gassoil: result.gassoil, diesel: result.diesel, bensin: result.bensin, updatedAt: result.updatedAt };
    }
    throw new Error('Ógildur prísur: ' + JSON.stringify(result));
  } catch(e) {
    console.log('Effo feilst:', e.message);
    return { source: 'Effo', ...KNOWN.Effo };
  }
}

async function main() {
  console.log('Byrjar at sækja prísir...', new Date().toISOString());

  const browser = await puppeteer.launch({
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
  });

  try {
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120');

    const [thomsen, magn, effo] = await Promise.all([
      scrapeThomsen(await browser.newPage()),
      scrapeMagn(await browser.newPage()),
      scrapeEffo(await browser.newPage())
    ]);

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
