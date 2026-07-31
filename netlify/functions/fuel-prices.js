const fs = require('fs');
const path = require('path');

// Neydloysn um prices-override.json ikki kann lesast (dagford 31/07/2026)
const FALLBACK = {
  sources: [
    { source: 'Thomsen', gassoil: '11.00', diesel: null, bensin: null, updatedAt: '28/07/2026' },
    { source: 'Magn', gassoil: '11.763', diesel: '11.73', bensin: '11.55', updatedAt: '31/07/2026' },
    { source: 'Effo', gassoil: '11.513', diesel: '11.53', bensin: '11.35', updatedAt: '27/07/2026' }
  ],
  updatedAt: null
};

function valid(d) {
  return d && Array.isArray(d.sources) && d.sources.length >= 3 && d.sources.every(function (s) { return s && s.source; });
}

function loadOverride() {
  // 1) beinleidis require (bundlad vid funktionini)
  try {
    const d = require('../../prices-override.json');
    if (valid(d)) return d;
  } catch (e) {}
  // 2) les fra fila-skipanini
  const candidates = [
    path.join(__dirname, '..', '..', 'prices-override.json'),
    path.join(process.cwd(), 'prices-override.json'),
    '/var/task/prices-override.json'
  ];
  for (let i = 0; i < candidates.length; i++) {
    try {
      const d = JSON.parse(fs.readFileSync(candidates[i], 'utf8'));
      if (valid(d)) return d;
    } catch (e) {}
  }
  return null;
}

exports.handler = async () => {
  const data = loadOverride() || FALLBACK;
  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'public, max-age=300'
    },
    body: JSON.stringify(data)
  };
};
