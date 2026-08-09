import puppeteer from "puppeteer";

export class Puppeteer {
  static async screenshot(url: string): Promise<Uint8Array> {
    // Launch browser with optimized settings for Cloud Functions
    const browser = await puppeteer.launch({
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-accelerated-2d-canvas",
        "--no-first-run",
        "--no-zygote",
        "--single-process",
        "--disable-gpu",
        "--disable-webgl",
        // Sometimes getting "Error: Timed out after 30000 ms while waiting for the WS endpoint URL to appear in stdout!"
        // https://github.com/nodejs/help/issues/3220#issuecomment-1228342313
        "--remote-debugging-port=9222",
      ],
    });

    const page = await browser.newPage();

    await page.setCacheEnabled(false);

    // Set mobile viewport for 1024x1024 resolution
    await page.setViewport({
      width: 1024,
      height: 1024,
      deviceScaleFactor: 2,
      isLandscape: false,
    });

    // Navigate to the URL and wait for network to be idle
    await page.goto(url, {
      waitUntil: "networkidle0",
      timeout: 30000,
    });

    // Take screenshot as PNG
    const screenshot = await page.screenshot({
      type: "png",
      fullPage: true,
    });

    await browser.close();

    return screenshot;
  }
}
