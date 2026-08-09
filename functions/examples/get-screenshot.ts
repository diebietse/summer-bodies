// Run with: npm run ts ./examples/get-screenshot.ts
import { Puppeteer } from "../src/puppeteer";
import { writeFileSync } from "fs";

async function getScreenshot() {
  try {
    const url = "https://www.example.com/";
    const screenshot = await Puppeteer.screenshot(url);
    writeFileSync("./excluded/screenshot.png", screenshot);
  } catch (error) {
    console.error("Screenshot function error:", error);
  }
}

getScreenshot();
