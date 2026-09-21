// Run with: npm run ts ./examples/upload-branding.ts -- --appName "My Challenge" --logo ./my-logo.svg [--favicon ./favicon.ico]
// Requires:
// * A service-account.json file with a firestore (and storage) service account in the project root directory
//
// Uploads a logo file (and optionally a favicon) to Firebase Storage and stores them, together with the app
// name, in Firestore - the single source of truth for branding. The website's `build` step (see
// website/scripts/fetch-branding.mjs) fetches this at *build* time (not in the browser) and bakes it into the
// static build, so the page's <title>/favicon are correct for link unfurlers (Slack, WhatsApp, etc.), which
// don't run JavaScript.
//
// Fixed formats only: the website always serves the logo from src/assets/logo.svg and the favicon from
// public/favicon.ico, so anything else written to those paths wouldn't render correctly.

import * as fs from "fs";
import * as path from "path";
import { parseArgs } from "node:util";
import { Firestore } from "../src/firestore";
import { uploadLogoToStorage } from "../src/firebase-storage";

const {
  values: { appName, logo, favicon },
} = parseArgs({
  options: {
    appName: { type: "string" },
    logo: { type: "string" },
    favicon: { type: "string" },
  },
});

if (!appName || !logo) {
  console.error('Usage: npm run ts ./examples/upload-branding.ts -- --appName "My Challenge" --logo ./my-logo.svg [--favicon ./favicon.ico]');
  process.exit(1);
}

if (path.extname(logo).toLowerCase() !== ".svg") {
  console.error(`Logo must be an .svg file (got "${logo}").`);
  process.exit(1);
}

if (favicon && path.extname(favicon).toLowerCase() !== ".ico") {
  console.error(`Favicon must be an .ico file (got "${favicon}").`);
  process.exit(1);
}

async function uploadBranding() {
  const logoUrl = await uploadLogoToStorage(fs.readFileSync(logo!), "logo.svg", "image/svg+xml");

  let faviconUrl: string | undefined;
  if (favicon) {
    faviconUrl = await uploadLogoToStorage(fs.readFileSync(favicon), "favicon.ico", "image/x-icon");
  }

  await Firestore.uploadBranding({ appName: appName!, logoUrl, ...(faviconUrl && { faviconUrl }) });
  console.log(`Branding uploaded: appName="${appName}", logoUrl=${logoUrl}${faviconUrl ? `, faviconUrl=${faviconUrl}` : ""}`);
}

uploadBranding();
