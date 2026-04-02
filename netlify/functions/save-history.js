const https = require("https");

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const REPO = "zacharias90-byte/Pr-svakt";
const FILE_PATH = "price-history.json";
const RAILWAY_URL = "https://prisvakt-scraper-production.up.railway.app/api/fuel-prices";

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { timeout: 10000 }, (res) => {
      let data = "";
      res.on("data", chunk => data += chunk);
      res.on("end", () => {
        try { resolve(JSON.parse(data)); }
        catch(e) { reject(e); }
      });
    }).on("error", reject).on("timeout", () => reject(new Error("Timeout")));
  });
}

function githubRequest(method, path, body) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const options = {
      hostname: "api.github.com",
      path,
      method,
      headers: {
        "Authorization": `token ${GITHUB_TOKEN}`,
        "User-Agent": "prisvakt-history",
        "Accept": "application/vnd.github.v3+json",
        "Content-Type": "application/json",
        ...(payload ? { "Content-Length": Buffer.byteLength(payload) } : {})
      }
    };
    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", chunk => data += chunk);
      res.on("end", () => {
        try { resolve(JSON.parse(data)); }
        catch(e) { resolve({}); }
      });
    });
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

exports.handler = async () => {
  try {
    // 1. Hent live priser fra Railway
    const priceData = await fetchJson(RAILWAY_URL);
    const sources = priceData.sources || [];

    // 2. Hent eksisterende price-history.json fra GitHub
    let existingHistory = [];
    let fileSha = null;
    try {
      const fileRes = await githubRequest("GET", `/repos/${REPO}/contents/${FILE_PATH}`);
      if (fileRes.content) {
        fileSha = fileRes.sha;
        const decoded = Buffer.from(fileRes.content, "base64").toString("utf8");
        existingHistory = JSON.parse(decoded);
      }
    } catch(e) {
      console.log("Ingen eksisterende historik — starter frisk");
    }

    // 3. Byg dagens datapunkt
    const today = new Date();
    const dateStr = today.toISOString().split("T")[0]; // "2026-04-02"
    const timeStr = today.toISOString();

    const todayEntry = {
      date: dateStr,
      time: timeStr,
      prices: {}
    };

    sources.forEach(s => {
      const key = s.source.toLowerCase();
      todayEntry.prices[key] = {
        gassoil: s.gassoil || null,
        diesel:  s.diesel  || null,
        bensin:  s.bensin  || null
      };
    });

    // 4. Tjek om vi allerede har en entry for i dag (opdater i så fald)
    const existingTodayIndex = existingHistory.findIndex(e => e.date === dateStr);
    if (existingTodayIndex >= 0) {
      existingHistory[existingTodayIndex] = todayEntry;
    } else {
      existingHistory.push(todayEntry);
    }

    // 5. Behold kun de seneste 90 dage
    existingHistory = existingHistory
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(-90);

    // 6. Gem opdateret historik til GitHub
    const content = Buffer.from(JSON.stringify(existingHistory, null, 2)).toString("base64");
    const commitBody = {
      message: `Opdater prishistorik ${dateStr}`,
      content,
      ...(fileSha ? { sha: fileSha } : {})
    };

    await githubRequest("PUT", `/repos/${REPO}/contents/${FILE_PATH}`, commitBody);

    console.log(`Historik gemt — ${existingHistory.length} dage logget`);

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ok: true,
        entries: existingHistory.length,
        latest: todayEntry
      })
    };

  } catch(e) {
    console.error("Fejl i save-history:", e.message);
    return {
      statusCode: 500,
      body: JSON.stringify({ ok: false, error: e.message })
    };
  }
};
