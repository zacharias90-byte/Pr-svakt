const https = require("https");
const http = require("http");

// ── KENDAR PRÍSIR (fallback um scraping brestir) ──
// Dagfør hesar um prísirnar broytast!
const KNOWN_PRICES = {
  Thomsen: { gassoil: "10.350", diesel: null,    bensin: null,    updatedAt: "26/03/2026" },
  Magn:    { gassoil: "12.313", diesel: "14.360", bensin: "14.700", updatedAt: "31/03/2026" },
  Effo:    { gassoil: "12.313", diesel: "14.360", bensin: "14.700", updatedAt: "26/03/2026" }
};

function fetchUrl(url, redirectCount = 0) {
  return new Promise((resolve, reject) => {
    if (redirectCount > 5) return reject(new Error("Too many redirects"));
    const lib = url.startsWith("https") ? https : http;
    const req = lib.get(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/122 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,*/*;q=0.9",
        "Accept-Language": "fo,da;q=0.9,en;q=0.8",
        "Cache-Control": "no-cache"
      },
      timeout: 12000
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        const next = res.headers.location.startsWith("http")
          ? res.headers.location
          : new URL(res.headers.location, url).href;
        return fetchUrl(next, redirectCount + 1).then(resolve).catch(reject);
      }
      let data = "";
      res.on("data", chunk => data += chunk);
      res.on("end", () => resolve(data));
    });
    req.on("error", reject);
    req.on("timeout", () => { req.destroy(); reject(new Error("Timeout")); });
  });
}

function parseFo(str) {
  // "12.125,00" -> 12125.00  eller "14,64" -> 14.64
  if (!str) return null;
  const s = str.trim().replace(/\s/g, "");
  // Hevur báðar: punktur og komma -> punktur er tusindtál
  if (s.includes(".") && s.includes(",")) {
    return parseFloat(s.replace(/\./g, "").replace(",", "."));
  }
  // Bert komma -> desimaltál
  if (s.includes(",")) return parseFloat(s.replace(",", "."));
  return parseFloat(s);
}

// ── THOMSEN ──────────────────────────────────────
async function fetchThomsen() {
  try {
    const html = await fetchUrl("https://thomsen.fo/oljuprisur");
    // "## DAGSPRÍSUR  10,35 kr/L"
    const m = html.match(/DAGSPRÍSUR\s+([\d,\.]+)\s*kr/i);
    if (m) {
      const p = parseFo(m[1]);
      if (p && p > 5 && p < 30) {
        const dateM = html.match(/(\d{2}\/\d{2}\/\d{4})/);
        return { source:"Thomsen", updatedAt: dateM?dateM[1]:"", gassoil: p.toFixed(3), diesel: null, bensin: null };
      }
    }
    throw new Error("Scraping feilst");
  } catch(e) {
    console.log("Thomsen scraping feilst:", e.message, "— nýti kendar prísir");
    return { source:"Thomsen", ...KNOWN_PRICES.Thomsen };
  }
}

// ── EFFO ─────────────────────────────────────────
async function fetchEffo() {
  try {
    const html = await fetchUrl("https://www.effo.fo/prisir/");

    // Dato: "26. mars 2026"
    const dateM = html.match(/(\d{1,2}\.\s*(?:januar|februar|mars|apríl|mai|juni|juli|august|september|oktober|november|desember)\s*\d{4})/i);
    const updatedAt = dateM ? dateM[1] : "";

    // Finn fyrstu tabellur eftir "Prísir brennievni"
    // Gassolja er per 1000L: "12.125,00 KR."
    // Bensin (Blýfrítt) og Diesel er per liter: "14,64 KR."
    const gasM    = html.match(/Gassolja[^|<]*\|\s*([\d\.,]+)\s*KR/i);
    const dieselM = html.match(/Diesel[^|<]*\|\s*([\d\.,]+)\s*KR/i);
    const bensinM = html.match(/Blýfrítt[^|<]*\|\s*([\d\.,]+)\s*KR/i);

    let gas    = gasM    ? parseFo(gasM[1])    : null;
    let diesel = dieselM ? parseFo(dieselM[1]) : null;
    let bensin = bensinM ? parseFo(bensinM[1]) : null;

    // Gassolja er per 1000L
    if (gas && gas > 100) gas = gas / 1000;

    // Valider
    if (gas && gas > 5 && gas < 30) {
      return { source:"Effo", updatedAt, gassoil: gas.toFixed(3), diesel: diesel?diesel.toFixed(3):null, bensin: bensin?bensin.toFixed(3):null };
    }
    throw new Error("Ógildur prísur: " + gas);
  } catch(e) {
    console.log("Effo scraping feilst:", e.message, "— nýti kendar prísir");
    return { source:"Effo", ...KNOWN_PRICES.Effo };
  }
}

// ── MAGN ─────────────────────────────────────────
async function fetchMagn() {
  try {
    const html = await fetchUrl("https://magn.fo/oljuprisir");

    const dateM = html.match(/(\d{1,2}\.\s*(?:januar|februar|mars|apríl|mai|juni|juli|august|september|oktober|november|desember)\s*\d{4})/i)
      || html.match(/(\d{1,2}\s+(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4})/i);
    const updatedAt = dateM ? dateM[1] : "";

    const gasM    = html.match(/[Gg]assol[jy]a[^|<]*\|\s*([\d\.,]+)/);
    const dieselM = html.match(/[Dd]iesel[^|<]*\|\s*([\d\.,]+)/);
    const bensinM = html.match(/[Bb]l[yý]fr[ií]tt[^|<]*\|\s*([\d\.,]+)/);

    let gas    = gasM    ? parseFo(gasM[1])    : null;
    let diesel = dieselM ? parseFo(dieselM[1]) : null;
    let bensin = bensinM ? parseFo(bensinM[1]) : null;

    if (gas && gas > 100) gas = gas / 1000;

    if (gas && gas > 5 && gas < 30) {
      return { source:"Magn", updatedAt, gassoil: gas.toFixed(3), diesel: diesel?diesel.toFixed(3):null, bensin: bensin?bensin.toFixed(3):null };
    }
    throw new Error("Ógildur prísur: " + gas);
  } catch(e) {
    console.log("Magn scraping feilst:", e.message, "— nýti kendar prísir");
    return { source:"Magn", ...KNOWN_PRICES.Magn };
  }
}

// ── HANDLER ──────────────────────────────────────
exports.handler = async () => {
  const [thomsen, magn, effo] = await Promise.all([
    fetchThomsen(),
    fetchMagn(),
    fetchEffo()
  ]);

  return {
    statusCode: 200,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "public, max-age=3600"
    },
    body: JSON.stringify({
      fetchedAt: new Date().toISOString(),
      sources: [thomsen, magn, effo]
    })
  };
};
