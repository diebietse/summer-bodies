// Run with: npm run ts ./examples/get-screenshot.ts -- [url]
// Writes one PNG per results-page section (see Puppeteer.screenshotSections) to ./excluded/. Point it at a deployed
// results page, or at the website's local dev preview, e.g. http://localhost:5173/preview?screenshot=true
import { Puppeteer } from "../src/puppeteer";
import { mkdirSync, writeFileSync } from "fs";

async function getScreenshot() {
  try {
    const url = process.argv[2] ?? "https://www.example.com/";
    mkdirSync("./excluded", { recursive: true });
    for (const { name, png } of await Puppeteer.screenshotSections(url)) {
      writeFileSync(`./excluded/screenshot-${name}.png`, png);
      console.log(`Wrote ./excluded/screenshot-${name}.png`);
    }
  } catch (error) {
    console.error("Screenshot function error:", error);
  }
}

getScreenshot();
