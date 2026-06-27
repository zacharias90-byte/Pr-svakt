const https = require('https');
const fs = require('fs');

// Fallback-prísir – uppfærast tá ið scraping lukkas
const KNOWN = {
  Thomsen: { gassoil: '10.350', diesel: null,    bensin: null,    updatedAt: '24/06/2026' },
  Magn:    { gassoil: '10.950', diesel: '10.520', bensin: '9.380', updatedAt: '25/06/2026' },
  Effo:    { gassoil: '10.950', diesel: '10.420', bensin: '9.380', updatedAt: '25/06/2026' }
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
// Síðan: https://www.magn.fo/oljuprisir  (Webflow CMS tabs)
//
// VANDAMÁL #1 – Dato: Webflow inniheldur ALLAR historiskar pristabar í HTML-inum.
//   Gamli kóðin fann dato frá einum eldri tíðindaartikkli í topp av síðuni.
//   RÆTTA: Leita bert í "w--tab-active" pane-inum (virkin tab = nýggjastu prísir).
//
// VANDAMÁL #2 – Gassolja: Gassolja-elementið hevur klassa "text-size-small"
//   UTTAN "pricing_number". Gamli kóðin leitaði bert eftir "pricing_number"
//   nær Gassolja → fann einki → gassoil: null.
//   RÆTTA: Leita eftir "text-size-small" nær Gassolja í aktiva pane-inum.
//
// Pris-snið: Magn brúkar prik sum desimalskiljari ("10.950" = 10,95 kr/L).
//   parseFloat("10.950") = 10.95 → .toFixed(3) = "10.950" → rætt.

async function scrapeMagn() {
  try {
    const html = await fetchUrl('https://www.magn.fo/oljuprisir');

    // ── Skopera til aktiva tab-pane (w--tab-active) ──────────────────────────
    // Webflow setur "w--tab-active" á virkan pane. Nøkurt pane byrjar við
    // "w-tab-pane". Vit taka tekstin millum aktiva pane og næsta pane.
    const tabStart  = html.indexOf('w--tab-active');
    const nextPane  = html.indexOf('w-tab-pane', tabStart + 50);
    const activeHtml = tabStart > -1
      ? html.substring(tabStart, nextPane > tabStart ? nextPane : tabStart + 8000)
      : html; // fallback: brúka heilt html

    // ── Dato frá aktiva pane ─────────────────────────────────────────────────
    // Format í HTML: "25\n.\nJUNI\n2026"  ella  "25.juni2026"
    // Nýtt: "apríl" (við accent) er eisini við
    const mn = {
      januar:'01', februar:'02', mars:'03',
      april:'04', 'apr\xedl':'04',       // apríl (Faroese)
      mai:'05', juni:'06', juli:'07', august:'08',
      september:'09', oktober:'10', november:'11', desember:'12'
    };
    let updatedAt = '';
    const dateMatch = activeHtml.match(
      /(\d{1,2})\s*[.\n\s]+\s*(januar|februar|mars|apr[i\xed]l|mai|juni|juli|august|september|oktober|november|desember)\s*(\d{4})/i
    );
    if (dateMatch) {
      const mKey = dateMatch[2].toLowerCase();
      updatedAt = dateMatch[1] + '/' + (mn[mKey] || '??') + '/' + dateMatch[3];
    }

    // ── Prísir frá pricing_number í aktiva pane ──────────────────────────────
    const nums = [];
    const re = /pricing_number[^>]*>([\d,]+)</g;
    let m;
    while ((m = re.exec(activeHtml)) !== null) {
      nums.push(parseFloat(m[1].replace(',', '.')));
    }
    // Raðfylgjin í aktiva pane:
    //   [0]=bensin, [1]=MVG, [2]=avgjald,
    //   [3]=bensin98, [4]=MVG, [5]=avgjald,
    //   [6]=diesel, [7]=MVG, ...
    const bensin = nums.length > 0 ? nums[0].toFixed(3) : null;
    const diesel = nums.length > 6 ? nums[6].toFixed(3) : null;

    // ── Gassolja: brúkar "text-size-small" (IKKI "pricing_number") ──────────
    let gassoil = null;
    const gasIdx = activeHtml.search(/Gassolja/i);
    if (gasIdx > -1) {
      const gasSec = activeHtml.substring(gasIdx, gasIdx + 800);
      // "text-size-small" elementið bert eftir Gassolja-label
      const gm = gasSec.match(/text-size-small[^>]*>([\d.]+)</);
      if (gm) {
        // parseFloat("10.950") = 10.95 kr/L → .toFixed(3) = "10.950"
        gassoil = parseFloat(gm[1]).toFixed(3);
      }
    }

    console.log('Magn:', { gassoil, diesel, bensin, updatedAt });

    if (gassoil && diesel && bensin &&
        parseFloat(gassoil) > 5 && parseFloat(diesel) > 5 && parseFloat(bensin) > 5) {
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
