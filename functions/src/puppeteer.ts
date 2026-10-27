import puppeteer from "puppeteer";

export interface SectionScreenshot {
  name: string;
  title: string;
  png: Uint8Array;
}

export class Puppeteer {
  // Screenshots each `[data-screenshot]` section of the page as its own image, in page order, with its
  // `data-screenshot-title` as the title. The first image also covers the page header above it (logo, date range),
  // so the set reads on its own. A page with no marked sections (e.g. an error page) yields one full-page image.
  //
  // In Cloud Functions, Chrome is occasionally slow to start or to load the page (a cold container), so a failed
  // attempt is retried once with a fresh browser before the job gives up.
  static async screenshotSections(url: string): Promise<SectionScreenshot[]> {
    try {
      return await Puppeteer.screenshotOnce(url);
    } catch (error) {
      console.warn(`Screenshot attempt failed, retrying once: ${error instanceof Error ? error.message : error}`);
      return await Puppeteer.screenshotOnce(url);
    }
  }

  private static async screenshotOnce(url: string): Promise<SectionScreenshot[]> {
    // Launch browser with optimized settings for Cloud Functions
    const browser = await puppeteer.launch({
      headless: true,
      // Puppeteer's 30 s default is sometimes not enough for Chrome to start in a cold function container.
      timeout: 90000,
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

    try {
      const page = await browser.newPage();

      await page.setCacheEnabled(false);

      // Wider than the results page's screenshot-mode max-width (1400px, see Results.vue) so that layout fills the
      // image, giving the three-per-row cards room for longer names. Sections are clipped from the full page, so the
      // height only seeds the layout.
      await page.setViewport({
        width: 1500,
        height: 1024,
        deviceScaleFactor: 2,
        isLandscape: false,
      });

      // Wait for what's actually needed - the results sections (or the page's error message) rendered, plus fonts and
      // images - rather than for the network to go fully quiet, which one slow request can hold off past the timeout.
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
      await page.waitForSelector("[data-screenshot], .alert-danger", { timeout: 60000 });
      await page.evaluate(async () => {
        await document.fonts.ready;
        const pending = [...document.images].filter((img) => !img.complete);
        await Promise.all(
          pending.map(
            (img) =>
              new Promise((resolve) => {
                img.addEventListener("load", resolve, { once: true });
                img.addEventListener("error", resolve, { once: true });
              }),
          ),
        );
      });

      const sections = await page.$$("[data-screenshot]");
      if (sections.length === 0) {
        return [{ name: "results", title: "Results", png: await page.screenshot({ type: "png", fullPage: true }) }];
      }

      const width = await page.evaluate(() => document.documentElement.scrollWidth);
      const screenshots: SectionScreenshot[] = [];
      for (const [index, section] of sections.entries()) {
        const box = await section.boundingBox();
        if (!box) continue;
        const [name, title] = await section.evaluate((el) => [
          el.getAttribute("data-screenshot") ?? "",
          el.getAttribute("data-screenshot-title") ?? "",
        ]);
        // Clipped exactly to the section (the page pads sections in screenshot mode), so no neighbour bleeds in.
        const top = index === 0 ? 0 : box.y;
        const bottom = box.y + box.height;
        const png = await page.screenshot({ type: "png", clip: { x: 0, y: top, width, height: bottom - top }, captureBeyondViewport: true });
        screenshots.push({ name, title, png });
      }
      return screenshots;
    } finally {
      await browser.close();
    }
  }
}
