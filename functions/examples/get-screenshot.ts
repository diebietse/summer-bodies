// Run with: npm run ts ./examples/get-screenshot.ts
import { Firestore } from "../src/firestore";
import { Puppeteer } from "../src/puppeteer";
import { writeFileSync } from "fs";

async function getScreenshot() {
  await Firestore.getConfig();
  try {
    const url = "https://www.example.com/";
    const screenshot = await Puppeteer.screenshot(url);
    writeFileSync("screenshot.png", screenshot);
  } catch (error) {
    console.error("Screenshot function error:", error);
  }
}

getScreenshot();
