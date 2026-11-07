// Run with: npm run ts ./examples/upload-branding.ts -- --appName "My Challenge" --logo ./my-logo.svg [--favicon ./favicon.ico]
//   [--organizer "The Fitness Club"] [--contactEmail challenge@example.com] [--resultsSharedIn "our team's Slack workspace"]
// Requires:
// * A service-account.json file with a firestore (and storage) service account in the project root directory
//
// Uploads a logo file (and optionally a favicon) to Firebase Storage and stores them, together with the app
// name, in Firestore - the single source of truth for branding. The website's `build` step (see
// website/scripts/fetch-branding.mjs) fetches this at *build* time (not in the browser) and bakes it into the
// static build, so the page's <title>/favicon are correct for link unfurlers (Slack, WhatsApp, etc.), which
// don't run JavaScript.
//
// --organizer, --contactEmail and --resultsSharedIn fill in the website's privacy page (who runs the challenge,
// how to reach them, where else results are posted). Once branding exists, any option can be given on its own:
// the others keep their stored values (so the logo needn't be uploaded again to change the contact), and an
// empty value (--resultsSharedIn "") removes one of these three.
//
// Fixed formats only: the website always serves the logo from src/assets/logo.svg and the favicon from
// public/favicon.ico, so anything else written to those paths wouldn't render correctly.

import * as fs from "fs";
import * as path from "path";
import { parseArgs } from "node:util";
import { Branding, Firestore } from "../src/firestore";
import { uploadLogoToStorage } from "../src/firebase-storage";

const USAGE =
  'Usage: npm run ts ./examples/upload-branding.ts -- --appName "My Challenge" --logo ./my-logo.svg [--favicon ./favicon.ico] [--organizer "..."] [--contactEmail ...] [--resultsSharedIn "..."]';

const { values } = parseArgs({
  options: {
    appName: { type: "string" },
    logo: { type: "string" },
    favicon: { type: "string" },
    organizer: { type: "string" },
    contactEmail: { type: "string" },
    resultsSharedIn: { type: "string" },
  },
});
const { logo, favicon } = values;

if (logo && path.extname(logo).toLowerCase() !== ".svg") {
  console.error(`Logo must be an .svg file (got "${logo}").`);
  process.exit(1);
}

if (favicon && path.extname(favicon).toLowerCase() !== ".ico") {
  console.error(`Favicon must be an .ico file (got "${favicon}").`);
  process.exit(1);
}

async function uploadBranding() {
  const existing = await Firestore.getBranding();
  const branding: Partial<Branding> = { ...existing };

  if (values.appName) branding.appName = values.appName;
  if (logo) branding.logoUrl = await uploadLogoToStorage(fs.readFileSync(logo), "logo.svg", "image/svg+xml");
  if (favicon) branding.faviconUrl = await uploadLogoToStorage(fs.readFileSync(favicon), "favicon.ico", "image/x-icon");
  for (const field of ["organizer", "contactEmail", "resultsSharedIn"] as const) {
    const value = values[field];
    if (value === undefined) continue;
    if (value) branding[field] = value;
    else delete branding[field];
  }

  if (!branding.appName || !branding.logoUrl) {
    console.error(`No branding stored yet, so --appName and --logo are both required.\n${USAGE}`);
    process.exit(1);
  }

  await Firestore.uploadBranding(branding as Branding);
  console.log("Branding uploaded:", branding);
}

uploadBranding();
