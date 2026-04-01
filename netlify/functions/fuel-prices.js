const https = require("https");
 
const RAILWAY_URL = "https://prisvakt-scraper-production.up.railway.app/api/fuel-prices";
 
// Fallback um Railway ikki svarar
const KNOWN_PRICES = {
  Thomsen: { gassoil: "10.350", diesel: null,    bensin: null,    updatedAt: "26/03/2026" },
  Magn:    { gassoil: "12.313", diesel: "14.360", bensin: "14.700", updatedAt: "31/03/2026" },
  Effo:    { gassoil: "12.313", diesel: "14.360", bensin: "14.700", updatedAt: "01/04/2026" }
};
 
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
 
exports.handler = async () => {
  try {
    const data = await fetchJson(RAILWAY_URL);
    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "public, max-age=3600"
      },
      body: JSON.stringify(data)
    };
  } catch(e) {
    console.log("Railway feilst:", e.message, "— nýti kendar prísir");
    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*"
      },
      body: JSON.stringify({
        fetchedAt: new Date().toISOString(),
        sources: [
          { source: "Thomsen", ...KNOWN_PRICES.Thomsen },
          { source: "Magn",    ...KNOWN_PRICES.Magn    },
          { source: "Effo",    ...KNOWN_PRICES.Effo    }
        ]
      })
    };
  }
};
 
