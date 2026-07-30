const https = require('https');
const fs = require('fs');

const KNOWN = {
  thomsen: { gassoil: '11.00', diesel: null, bensin: null, date: '28/07/2026' },
  magn: { gassoil: '11.513', diesel: '11.530', bensin: '11.350', date: '30/07/2026' },
  effo: { gassoil: '11.513', diesel: '11.53', bensin: '11.35', date: '30/07/2026' }
};

async function fetchPrice(url) {
  return new Promise((resolve) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch { resolve(null); }
      });
    }).on('error', () => resolve(null));
  });
}

async function scrape() {
  const thomsen = KNOWN.thomsen;
  const magn = KNOWN.magn;
  const effo = KNOWN.effo;

  const prices = {
    sources: [
      { source: "Thomsen", gassoil: thomsen.gassoil, diesel: thomsen.diesel, bensin: thomsen.bensin, updatedAt: thomsen.date },
      { source: "Magn", gassoil: magn.gassoil, diesel: magn.diesel, bensin: magn.bensin, updatedAt: magn.date },
      { source: "Effo", gassoil: effo.gassoil, diesel: effo.diesel, bensin: effo.bensin, updatedAt: effo.date }
    ],
    updatedAt: new Date().toISOString()
  };

  fs.writeFileSync('prices-override.json', JSON.stringify(prices, null, 2));
  console.log('✅ Prices updated');
}

scrape();
