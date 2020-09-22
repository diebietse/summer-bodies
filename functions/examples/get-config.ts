// Run with: npm run ts ./examples/get-config.ts
// Requires:
// * A service-account.json file with a firestore service account in the project root directory

import { Firestore } from "../src/firestore";

async function getConfig() {
  const config = await Firestore.getConfig();
  console.log(config);
}

getConfig();
