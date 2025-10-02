// Based on https://pptr.dev/troubleshooting#could-not-find-expected-browser-locally
// And https://pptr.dev/troubleshooting#running-puppeteer-on-google-cloud-functions
// Also update package.json with a postinstall script: "scripts": { ..., "postinstall": "npx puppeteer browsers install chrome" },
const {join} = require('path');

/**
 * @type {import("puppeteer").Configuration}
 */
module.exports = {
  cacheDirectory: join(__dirname, 'node_modules', '.puppeteer_cache'),
};