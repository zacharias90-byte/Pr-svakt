// netlify/functions/save-history.js
const https = require('https');
const localHistory = require('../../price-history.json');

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const REPO = 'zacharias90-byte/Pr-svakt';

function countNonNullPrices(entry) {
  if (!entry || !entry.prices) return 0;
  let n = 0;
  Object.values(entry.prices).forEach(p => {
    if (!p) return;
    ['gassoil', 'diesel', 'bensin'].forEach(k => {
      if (p[k] !== null && p[k] !== undefined && p[k] !== '') n++;
    });
  });
  return n;
}

function mergeHistories(githubHist, localHist) {
  const map = new Map();
  const local = Array.isArray(localHist) ? localHist : [];
  const github = Array.isArray(githubHist) ? githubHist : [];
  local.forEach(e => { if (e && e.date) map.set(e.date, e); });
  github.forEach(e => {
    if (!e || !e.date) return;
    const existing = map.get(e.date);
    if (!existing) { map.set(e.date, e); return; }
    const ghCount = countNonNullPrices(e);
    const exCount = countNonNullPrices(existing);
    if (ghCount > exCount) map.set(e.date, e);
    else if (ghCount === exCount) {
      const ghTime = e.time ? Date.parse(e.time) : 0;
      const exTime = existing.time ? Date.parse(existing.time) : 0;
      if (ghTime >= exTime) map.set(e.date, e);
    }
  });
  return Array.from(map.values()).sort((a, b) => String(a.date).localeCompare(String(b.date)));
}

function githubGet(path) {
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'api.github.com',
      path,
      method: 'GET',
      headers: {
        'Authorization': `token ${GITHUB_TOKEN}`,
        'User-Agent': 'Prisvakt',
        'Accept': 'application/vnd.github.v3+json'
      }
    }, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => { try { resolve(JSON.parse(data)); } catch(e) { reject(e); } });
    });
    req.on('error', reject);
    req.end();
  });
}

function githubPut(path, body) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const req = https.request({
      hostname: 'api.github.com',
      path,
      method: 'PUT',
      headers: {
        'Authorization': `token ${GITHUB_TOKEN}`,
        'User-Agent': 'Prisvakt',
        'Accept': 'application/vnd.github.v3+json',
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload)
      }
    }, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => { try { resolve(JSON.parse(data)); } catch(e) { reject(e); } });
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

async function getFileWithSha(filename) {
  try {
    const r = await githubGet(`/repos/${REPO}/contents/${filename}`);
    const content = Buffer.from(r.content, 'base64').toString('utf-8');
    return { data: JSON.parse(content), sha: r.sha };
  } catch(e) {
    return { data: null, sha: null };
  }
}

async function getCurrentPrices() {
  // Prøv prices-override.json først (manuel opdatering)
  try {
    const { data } = await getFileWithSha('prices-override.json');
    if (data && data.sources && data.sources.length) {
      console.log('Nýti prices-override.json');
      return data.sources;
    }
  } catch(e) {}

  // Fallback: Railway
  try {
    const data = await new Promise((resolve, reject) => {
      const req = https.get('https://prisvakt-scraper-production.up.railway.app/api/fuel-prices', {
        timeout: 8000
      }, res => {
        let d = '';
        res.on('data', c => d += c);
        res.on('end', () => { try { resolve(JSON.parse(d)); } catch(e) { reject(e); } });
      });
      req.on('error', reject);
      req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
    });
    if (data.sources && data.sources.length) {
      console.log('Nýti Railway');
      return data.sources;
    }
  } catch(e) {
    console.log('Railway feilst:', e.message);
  }

  return null;
}

exports.handler = async () => {
  try {
    const sources = await getCurrentPrices();
    if (!sources) throw new Error('Eingi prísir fundin');

    // Hent eksisterende historik fra GitHub og flet saman við lokala filuni
    // (so mars/apríl dátur frá lokala filuni ikki hvørva um GitHub-historikkurin er ósamfeldur)
    const { data: history, sha } = await getFileWithSha('price-history.json');
    const hist = mergeHistories(history, localHistory);

    // Byg ny entry
    const today = new Date().toISOString().split('T')[0];
    const entry = {
      date: today,
      time: new Date().toISOString(),
      prices: {
        thomsen: { gassoil: null, diesel: null, bensin: null },
        magn:    { gassoil: null, diesel: null, bensin: null },
        effo:    { gassoil: null, diesel: null, bensin: null }
      }
    };

    sources.forEach(s => {
      const key = s.source.toLowerCase();
      if (entry.prices[key] !== undefined) {
        entry.prices[key] = {
          gassoil: s.gassoil || null,
          diesel:  s.diesel  || null,
          bensin:  s.bensin  || null
        };
      }
    });

    // Tilføj eller opdater dagens entry
    const idx = hist.findIndex(e => e.date === today);
    if (idx >= 0) hist[idx] = entry;
    else hist.push(entry);

    // Behold max 365 dage
    const trimmed = hist.slice(-365);

    // Gem til GitHub
    const content = Buffer.from(JSON.stringify(trimmed, null, 2)).toString('base64');
    await githubPut(`/repos/${REPO}/contents/price-history.json`, {
      message: `Uppfær príshistorik ${today}`,
      content,
      ...(sha ? { sha } : {})
    });

    console.log('Príshistorik goymd:', today);
    return {
      statusCode: 200,
      body: JSON.stringify({ ok: true, date: today, sources: sources.map(s => s.source) })
    };
  } catch(e) {
    console.error('save-history feilst:', e.message);
    return { statusCode: 500, body: JSON.stringify({ ok: false, error: e.message }) };
  }
};
