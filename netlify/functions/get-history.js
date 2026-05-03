const https = require("https");
const localHistory = require("../../price-history.json");

const REPO = "zacharias90-byte/Pr-svakt";
const FILE_PATH = "price-history.json";
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const headers = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Cache-Control": "public, max-age=3600"
};

function jsonResponse(history) {
  return {
    statusCode: 200,
    headers,
    body: JSON.stringify(Array.isArray(history) ? history : [])
  };
}

function githubRequest(path) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: "api.github.com",
      path,
      method: "GET",
      headers: {
        "Authorization": `token ${GITHUB_TOKEN}`,
        "User-Agent": "prisvakt-history",
        "Accept": "application/vnd.github.v3+json"
      }
    };
    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", chunk => data += chunk);
      res.on("end", () => {
        try { resolve(JSON.parse(data)); }
        catch(e) { reject(e); }
      });
    });
    req.on("error", reject);
    req.end();
  });
}

function countNonNullPrices(entry) {
  if (!entry || !entry.prices) return 0;
  let n = 0;
  Object.values(entry.prices).forEach(p => {
    if (!p) return;
    ["gassoil", "diesel", "bensin"].forEach(k => {
      if (p[k] !== null && p[k] !== undefined && p[k] !== "") n++;
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
    if (!existing) {
      map.set(e.date, e);
      return;
    }
    // Prefer the entry with more non-null price values; tie-break by newer "time"
    const ghCount = countNonNullPrices(e);
    const exCount = countNonNullPrices(existing);
    if (ghCount > exCount) {
      map.set(e.date, e);
    } else if (ghCount === exCount) {
      const ghTime = e.time ? Date.parse(e.time) : 0;
      const exTime = existing.time ? Date.parse(existing.time) : 0;
      if (ghTime >= exTime) map.set(e.date, e);
    }
  });

  return Array.from(map.values()).sort((a, b) => String(a.date).localeCompare(String(b.date)));
}

exports.handler = async () => {
  try {
    const fileRes = await githubRequest(`/repos/${REPO}/contents/${FILE_PATH}`);
    if (!fileRes.content) {
      return jsonResponse(localHistory);
    }
    const decoded = Buffer.from(fileRes.content, "base64").toString("utf8");
    const githubHistory = JSON.parse(decoded);

    const merged = mergeHistories(githubHistory, localHistory);
    return jsonResponse(merged);
  } catch(e) {
    console.error("Fejl i get-history:", e.message);
    return jsonResponse(localHistory);
  }
};
