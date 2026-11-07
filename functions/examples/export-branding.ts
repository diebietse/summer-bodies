// Run with: npm run ts ./examples/export-branding.ts -- <output.json>
// Requires:
// * A service-account.json file with a firestore service account in the project root directory
//
// Writes the branding stored in Firestore (see upload-branding.ts) to <output.json> - `{}` if none is set. The
// website's build (website/scripts/fetch-branding.mjs) runs this to bake branding in, reading Firestore with the
// service account rather than through a public endpoint. To a file rather than stdout, since firestore.ts logs to
// stdout as it starts.

import { writeFileSync } from "fs";
import { Firestore } from "../src/firestore";

const [output] = process.argv.slice(2);
if (!output) {
  console.error("Usage: npm run ts ./examples/export-branding.ts -- <output.json>");
  process.exit(1);
}

Firestore.getBranding().then((branding) => writeFileSync(output, JSON.stringify(branding ?? {})));
