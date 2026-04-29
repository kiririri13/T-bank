const fs = require("fs");
const path = require("path");

const publicDir = path.join(__dirname, "..", "public");
const apiBaseUrl = String(process.env.API_BASE_URL || "").replace(/\/+$/, "");

const config = `window.APP_CONFIG = {
  API_BASE_URL: ${JSON.stringify(apiBaseUrl)},
};
`;

fs.writeFileSync(path.join(publicDir, "config.js"), config);
console.log(`Generated public/config.js with API_BASE_URL=${apiBaseUrl || "(same origin)"}`);
