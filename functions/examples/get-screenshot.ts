// Run with: npm run ts ./examples/get-screenshot.ts
import { Puppeteer } from "../src/puppeteer";
import { writeFileSync } from "fs";

async function getScreenshot() {
  try {
    // const url = "http://localhost:8080/results/af5dd35f-1e57-444b-9fab-41e7640c1590?screenshot=true";
    const url = "https://www.example.com/";
    const screenshot = await Puppeteer.screenshot(url);
    writeFileSync("./excluded/screenshot.png", screenshot);
  } catch (error) {
    console.error("Screenshot function error:", error);
  }
}

getScreenshot();
