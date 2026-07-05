const https = require('https');
const fs = require('fs');

// Fallback-prísir – uppfærast tá ið scraping lukkas
const KNOWN = {
  Thomsen: { gassoil: '10.350', diesel: null,    bensin: null,    updatedAt: '24/06/2026' },
  Magn: { gassoil: '10.950', diesel: '10.520', bensin: '9.730', updatedAt: '01/07/2026' },
  Effo: { gassoil: '10.950', diesel: '10.520', bensin: '9.730', updatedAt: '01/07/2026' }
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

// ─── THOMSEN ────────────────────────────────────────────────────────────────
// Síðan: https://thomsen.fo/oljuprisur
// Prísur eru í ein HTML-tabell: fyrstu data-røðina hevur dato og pris.
// DAGSPRÍSUR-headingurin hevur Í (unicode) – ikki vanligt I!

async function scrapeThomsen() {
  try {
    const html = await fetchUrl('https://thomsen.fo/oljuprisur');

    // RÆTTA: [IÍ] handlar bæði "I" og "Í" (accentuated Faroese character)
    const headMatch = html.match(/DAGSPR[I\xCD]SUR[\s\S]{0,80}?([\d]+[,\.][\d]+)\s*kr/i);

    // Fallback: fyrstu data-røðin í tabellinum  →  DD/MM/YYYY … XX,XX kr/L
    const rowMatch = html.match(/(\d{2}\/\d{2}\/\d{4})[^<]*<\/td>[^<]*<td[^>]*>([\d]+[,\.][\d]+)\s*kr/i);

    let val = null, dateStr = '';

    if (rowMatch) {
      // Tabellrøð er tryggar kelda – dato og pris í somu røð
      dateStr = rowMatch[1];
      val = parseFloat(rowMatch[2].replace(',', '.'));
    } else if (headMatch) {
      val = parseFloat(headMatch[1].replace(',', '.'));
      const dMatch = html.match(/(\d{2}\/\d{2}\/\d{4})/);
      dateStr = dMatch ? dMatch[1] : '';
    }

    if (val && val > 5 && val < 20) {
      console.log('Thomsen OK:', val.toFixed(3), '|', dateStr);
      return { source: 'Thomsen', gassoil: val.toFixed(3), diesel: null, bensin: null, updatedAt: dateStr };
    }
    throw new Error('Fann ikki pris');
  } catch (e) {
    console.log('Thomsen feilst:', e.message);
    return { source: 'Thomsen', ...KNOWN.Thomsen };
  }
}

// ─── MAGN ───────────────────────────────────────────────────────────────────
// Síðan: https://www.magn.fo/oljuprisir (Webflow CMS)
//
// VANDAMÁL (rættað 05/07/2026): Ráa HTML-ið frá magn.fo er ein Webflow
// CMS-listi (w-dyn-item) við ØLLUM prisblokkum – nýggjasta FYRST.
// Aktiv-tab klassan á prís-panes og føroysk mánaðanøvn finnast IKKI í ráum
// HTML (tabs verða sett við JS, og mánaðir eru á enskum: "July", "June").
// Tøl brúka prik sum desimalskiljara: "9.730" = 9,73 kr/L.
//
// RÆTTA: Tak FYRSTA "pricing_component"-blokkin (nýggjasti prísur),
// les dato frá date-wrapper (enskir mánaðir) og prísir frá fyrsta
// talinum aftaná hvørjum label ("Í alt"-virðið).

async function scrapeMagn() {
  try {
    const html = await fetchUrl('https://www.magn.fo/oljuprisir');

    // Fyrsti pricing_component = nýggjasti prísblokkur
    const start = html.indexOf('pricing_component');
    if (start < 0) throw new Error('Fann ikki pricing_component');
    const end = html.indexOf('pricing_component', start + 20);
    const block = html.substring(start, end > -1 ? end : start + 30000);

    // Dato: heading-date / date-wrapper við ENSKUM mánaðanøvnum
    const mn = {
      january: '01', february: '02', march: '03', april: '04',
      may: '05', june: '06', july: '07', august: '08',
      september: '09', october: '10', november: '11', december: '12'
    };
    const dm = block.match(/(?:date-wrapper|heading-date)[\s\S]{0,300}?>(\d{1,2})<[\s\S]{0,300}?>(January|February|March|April|May|June|July|August|September|October|November|December)<[\s\S]{0,200}?>(\d{4})</i);
    const updatedAt = dm
      ? dm[1].padStart(2, '0') + '/' + mn[dm[2].toLowerCase()] + '/' + dm[3]
      : '';

    // Prísur: finn label og tak fyrsta talið aftaná (= "Í alt")
    const val = (label) => {
      const li = block.indexOf('>' + label + '<');
      if (li < 0) return null;
      const seg = block.substring(li, li + 1200);
      const m = seg.match(/(?:pricing_number|text-size-small)[^>]*>([\d.]+)</);
      return m ? parseFloat(m[1]).toFixed(3) : null;
    };

    const bensin = val('Bensin');
    const diesel = val('Diesel');
    const gassoil = val('Gassolja');

    console.log('Magn:', { gassoil, diesel, bensin, updatedAt });

    if (gassoil && diesel && bensin &&
        parseFloat(gassoil) > 5 && parseFloat(gassoil) < 25 &&
        parseFloat(diesel) > 5 && parseFloat(diesel) < 25 &&
        parseFloat(bensin) > 5 && parseFloat(bensin) < 25) {
      return { source: 'Magn', gassoil, diesel, bensin, updatedAt };
    }
    throw new Error('Ogildur prisur: ' + JSON.stringify({ gassoil, diesel, bensin }));
  } catch (e) {
    console.log('Magn feilst:', e.message);
    return { source: 'Magn', ...KNOWN.Magn };
  }
}

// ─── EFFO ───────────────────────────────────────────────────────────────────
// Óbroytt – virkar sum vantað

async function scrapeEffo() {
  try {
    const html = await fetchUrl('https://www.effo.fo/prisir/');

    const dateMatch = html.match(/(\d{1,2})\.\s+(apr[ií]l|mars|februar|januar|mai|juni|juli|august|september|oktober|november|desember)\s+(\d{4})/i);
    let updatedAt = '';
    if (dateMatch) {
      updatedAt = dateMatch[1] + '/' + dateMatch[2].substring(0, 3) + '/' + dateMatch[3];
    }

    const parts = html.split(/\d{1,2}\.\s+(?:apr[ií]l|mars|februar|januar|mai|juni|juli|august|september|oktober|november|desember)\s+\d{4}/i);
    const firstBlock = parts.length > 1 ? parts[1] : html;

    const bensinMatch  = firstBlock.match(/(?:Blyfritt|Blyfridt|Bensin\s*95)[\s\S]{0,80}?([\d]+,[\d]+)\s*KR/i);
    const dieselMatch  = firstBlock.match(/(?<!Bata)[Dd]iesel[\s\S]{0,50}?([\d]+,[\d]+)\s*KR/i);
    const gasMatch     = firstBlock.match(/Gassolja[\s\S]{0,80}?([\d]+\.[\d]+),[\d]+\s*KR/i);

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
    throw new Error('Ogildur prisur: ' + JSON.stringify({ gassoil, diesel, bensin }));
  } catch (e) {
    console.log('Effo feilst:', e.message);
    return { source: 'Effo', ...KNOWN.Effo };
  }
}

// ─── MAIN ────────────────────────────────────────────────────────────────────

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
