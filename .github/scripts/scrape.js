const https = require('https');
const fs = require('fs');

// Fallback-prisir um ein kelda ikki svarar (dagford 31/07/2026)
const KNOWN = {
  thomsen: { gassoil: '11.00', diesel: null, bensin: null, date: '28/07/2026' },
  magn: { gassoil: '11.763', diesel: '11.73', bensin: '11.55', date: '31/07/2026' },
  effo: { gassoil: '11.513', diesel: '11.53', bensin: '11.35', date: '27/07/2026' }
};

const EN_MONTHS = ['january','february','march','april','may','june','july','august','september','october','november','december'];
const FO_MONTHS = ['januar','februar','mars','apríl','mai','juni','juli','august','september','oktober','november','desember'];

function pad(n) { return String(n).padStart(2, '0'); }
function sane(v) { return typeof v === 'number' && isFinite(v) && v >= 5 && v <= 25; }

function get(url, depth) {
  depth = depth || 0;
  return new Promise(function (resolve) {
    const opts = { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; PrisvaktBot/1.0)', 'Accept': 'text/html,application/xhtml+xml' } };
    const req = https.get(url, opts, function (res) {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && depth < 5) {
        res.resume();
        resolve(get(new URL(res.headers.location, url).toString(), depth + 1));
        return;
      }
      let data = '';
      res.setEncoding('utf8');
      res.on('data', function (c) { data += c; });
      res.on('end', function () { resolve(data); });
    });
    req.on('error', function () { resolve(null); });
    req.setTimeout(30000, function () { req.destroy(); resolve(null); });
  });
}

function stripTags(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ');
}

// Magn: Webflow CMS-listi, nyggjasta blokkin fyrst.
async function scrapeMagn() {
  const html = await get('https://www.magn.fo/oljuprisir');
  if (!html) return null;
  const idx = [];
  const re = /pricing_component/g;
  let m;
  while ((m = re.exec(html)) !== null && idx.length < 2) idx.push(m.index);
  if (!idx.length) return null;
  const block = html.slice(idx[0], idx.length > 1 ? idx[1] : idx[0] + 9000);
  function num(label) {
    const i = block.indexOf('>' + label + '<');
    if (i < 0) return null;
    const mm = block.slice(i).match(/(?:pricing_number|text-size-small)[^>]*>([\d.]+)</);
    return mm ? parseFloat(mm[1]) : null;
  }
  const g = num('Gassolja'), d = num('Diesel'), b = num('Bensin');
  if (!sane(g) || !sane(d) || !sane(b)) return null;
  let date = null;
  const dm = block.match(/>\s*(\d{1,2})\s*\.?\s*<[\s\S]{0,200}?>\s*([A-Za-z]{3,9})\s*<[\s\S]{0,200}?>\s*(20\d\d)\s*</);
  if (dm) {
    const mi = EN_MONTHS.indexOf(dm[2].toLowerCase());
    if (mi >= 0) date = pad(dm[1]) + '/' + pad(mi + 1) + '/' + dm[3];
  }
  return { gassoil: g.toFixed(3), diesel: d.toFixed(2), bensin: b.toFixed(2), date: date || KNOWN.magn.date };
}

// Effo: gassolja er skrivað sum kr fyri 1000 L.
async function scrapeEffo() {
  const html = await get('https://www.effo.fo/prisir/');
  if (!html) return null;
  const t = stripTags(html);
  function num(rx) {
    const mm = t.match(rx);
    if (!mm) return null;
    return parseFloat(mm[1].replace(/\./g, '').replace(',', '.'));
  }
  const b = num(/Bensin 95 E10\s+([\d.]+,\d+)/);
  const d = num(/\sDiesel\s+([\d.]+,\d+)/);
  let g = num(/Gassolja\s+([\d.]+,\d+)/);
  if (g && g > 1000) g = g / 1000;
  if (!sane(g) || !sane(d) || !sane(b)) return null;
  let date = null;
  const dm = t.match(/(\d{1,2})\.\s*([A-Za-z\u00c0-\u017e]+)\s*(20\d\d)/);
  if (dm) {
    const mi = FO_MONTHS.indexOf(dm[2].toLowerCase());
    if (mi >= 0) date = pad(dm[1]) + '/' + pad(mi + 1) + '/' + dm[3];
  }
  return { gassoil: g.toFixed(3), diesel: d.toFixed(2), bensin: b.toFixed(2), date: date || KNOWN.effo.date };
}

// Thomsen: bert gassolja, ovasta rað í talvuni.
async function scrapeThomsen() {
  const html = await get('https://thomsen.fo/oljuprisur');
  if (!html) return null;
  const t = stripTags(html);
  const mm = t.match(/(\d{2})\/(\d{2})\/(20\d\d)\s+([\d,]+)\s*kr\/L/i);
  if (!mm) return null;
  const g = parseFloat(mm[4].replace(',', '.'));
  if (!sane(g)) return null;
  return { gassoil: g.toFixed(2), diesel: null, bensin: null, date: mm[1] + '/' + mm[2] + '/' + mm[3] };
}

async function main() {
  const r = await Promise.all([scrapeThomsen(), scrapeMagn(), scrapeEffo()]);
  const thomsen = r[0] || KNOWN.thomsen;
  const magn = r[1] || KNOWN.magn;
  const effo = r[2] || KNOWN.effo;
  console.log('thomsen:', r[0] ? 'scraped' : 'FALLBACK', JSON.stringify(thomsen));
  console.log('magn:', r[1] ? 'scraped' : 'FALLBACK', JSON.stringify(magn));
  console.log('effo:', r[2] ? 'scraped' : 'FALLBACK', JSON.stringify(effo));

  const prices = {
    sources: [
      { source: 'Thomsen', gassoil: thomsen.gassoil, diesel: thomsen.diesel, bensin: thomsen.bensin, updatedAt: thomsen.date },
      { source: 'Magn', gassoil: magn.gassoil, diesel: magn.diesel, bensin: magn.bensin, updatedAt: magn.date },
      { source: 'Effo', gassoil: effo.gassoil, diesel: effo.diesel, bensin: effo.bensin, updatedAt: effo.date }
    ],
    updatedAt: new Date().toISOString()
  };
  fs.writeFileSync('prices-override.json', JSON.stringify(prices, null, 2) + '\n');

  let hist = [];
  try {
    const raw = JSON.parse(fs.readFileSync('price-history.json', 'utf8'));
    if (Array.isArray(raw)) hist = raw;
  } catch (e) { hist = []; }
  const now = new Date();
  const day = now.toISOString().slice(0, 10);
  const entry = {
    date: day,
    prices: {
      effo: { bensin: effo.bensin, diesel: effo.diesel, gassoil: effo.gassoil },
      magn: { bensin: magn.bensin, diesel: magn.diesel, gassoil: magn.gassoil },
      thomsen: { bensin: thomsen.bensin, diesel: thomsen.diesel, gassoil: thomsen.gassoil }
    },
    time: now.toISOString()
  };
  const at = hist.findIndex(function (h) { return h && h.date === day; });
  if (at >= 0) hist[at] = entry; else hist.push(entry);
  hist.sort(function (a, b) { return a.date < b.date ? -1 : (a.date > b.date ? 1 : 0); });
  fs.writeFileSync('price-history.json', JSON.stringify(hist, null, 2) + '\n');
  console.log('OK: prisir og sogu dagford');
}

main();
