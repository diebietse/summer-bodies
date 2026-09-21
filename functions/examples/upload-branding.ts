// Run with: npm run ts ./examples/upload-branding.ts -- --appName "My Challenge" --logo ./my-logo.svg
// Requires:
// * A service-account.json file with a firestore (and storage) service account in the project root directory
//
// Uploads a logo file to Firebase Storage and stores it, together with the app name, in Firestore - the single
// source of truth for branding. The website's `prebuild` step (see website/scripts/fetch-branding.mjs) fetches
// this at *build* time (not in the browser) and bakes it into the static build, so the page's <title> and
// og/meta tags are correct for link unfurlers (Slack, WhatsApp, etc.), which don't run JavaScript.
//
// SVG only: the website always serves the logo from the fixed path src/assets/logo.svg, so a raster format
// written there wouldn't render (the file is served with an SVG content type based on its extension).

import * as fs from "fs";
import * as path from "path";
import { parseArgs } from "node:util";
import { Firestore } from "../src/firestore";
import { uploadLogoToStorage } from "../src/firebase-storage";

const {
  values: { appName, logo },
} = parseArgs({
  options: {
    appName: { type: "string" },
    logo: { type: "string" },
  },
});

if (!appName || !logo) {
  console.error('Usage: npm run ts ./examples/upload-branding.ts -- --appName "My Challenge" --logo ./my-logo.svg');
  process.exit(1);
}

if (path.extname(logo).toLowerCase() !== ".svg") {
  console.error(`Logo must be an .svg file (got "${logo}").`);
  process.exit(1);
}

async function uploadBranding() {
  const fileData = fs.readFileSync(logo!);
  const logoUrl = await uploadLogoToStorage(fileData, "logo.svg", "image/svg+xml");
  await Firestore.uploadBranding({ appName: appName!, logoUrl });
  console.log(`Branding uploaded: appName="${appName}", logoUrl=${logoUrl}`);
}

uploadBranding();
