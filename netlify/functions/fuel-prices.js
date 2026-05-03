const https = require('https');

let localOverride = null;
try { localOverride = require('../../prices-override.json'); } catch (e) {}

const KNOWN_PRICES = [
  { source: 'Thomsen', gassoil: '10.500', diesel: null,     bensin: null,     updatedAt: '29/04/2026' },
  { source: 'Magn',    gassoil: '12.600', diesel: '14.130', bensin: '13.590', updatedAt: '01/05/2026' },
  { source: 'Effo',    gassoil: '12.313', diesel: '13.860', bensin: '13.330', updatedAt: '29/04/2026' }
];

function githubGet(path) {
  return new Promise((resolve, reject) => {
    const opts = {
      hostname: 'api.github.com',
      path,
      method: 'GET',
      headers: {
        'Authorization': `token ${process.env.GITHUB_TOKEN}`,
        'User-Agent': 'Prisvakt',
        'Accept': 'application/vnd.github.v3+json'
      }
    };
    const req = https.request(opts, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch(e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

exports.handler = async () => {
  // Foretræk lokala prices-override.json (altíð frískt eftir hvørt deploy)
  if (localOverride && localOverride.sources && localOverride.sources.length) {
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ fetchedAt: localOverride.updatedAt, sources: localOverride.sources })
    };
  }

  try {
    // Fallback: hent prices-override.json beinleiðis frá GitHub
    const file = await githubGet('/repos/zacharias90-byte/Pr-svakt/contents/prices-override.json');
    if (file.content) {
      const content = Buffer.from(file.content, 'base64').toString('utf-8');
      const data = JSON.parse(content);
      if (data.sources && data.sources.length) {
        return {
          statusCode: 200,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
          body: JSON.stringify({ fetchedAt: data.updatedAt, sources: data.sources })
        };
      }
    }
  } catch(e) {
    console.log('Override ikki funnin, nýti Railway:', e.message);
  }

  // Fallback: prøv Railway
  try {
    const railwayUrl = 'https://prisvakt-scraper-production.up.railway.app/api/fuel-prices';
    const data = await new Promise((resolve, reject) => {
      const req = https.get(railwayUrl, { timeout: 8000 }, res => {
        let d = '';
        res.on('data', c => d += c);
        res.on('end', () => { try { resolve(JSON.parse(d)); } catch(e) { reject(e); } });
      });
      req.on('error', reject);
      req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
    });
    if (data.sources && data.sources.length) {
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify(data)
      };
    }
  } catch(e) {
    console.log('Railway feilst:', e.message);
  }

  // Fallback: kendar prísir
  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    body: JSON.stringify({ fetchedAt: new Date().toISOString(), sources: KNOWN_PRICES })
  };
};
