const https = require("https");

const REPO = "zacharias90-byte/Pr-svakt";
const FILE_PATH = "price-history.json";
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;

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

exports.handler = async () => {
  try {
    const fileRes = await githubRequest(`/repos/${REPO}/contents/${FILE_PATH}`);
    if (!fileRes.content) {
      return {
        statusCode: 200,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
          "Cache-Control": "public, max-age=3600"
        },
        body: JSON.stringify([])
      };
    }
    const decoded = Buffer.from(fileRes.content, "base64").toString("utf8");
    const history = JSON.parse(decoded);

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "public, max-age=3600"
      },
      body: decoded
    };
  } catch(e) {
    console.error("Fejl i get-history:", e.message);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: e.message })
    };
  }
};
