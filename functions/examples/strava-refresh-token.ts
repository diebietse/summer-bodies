// Run with: npm run ts ./examples/strava-refresh-token.ts
// Requires:
// * Valid config loaded on firestore (including strava credentials)
// * A service-account.json file with a firestore service account in the project root directory

import axios from "axios";
import { Firestore } from "../src/firestore";
import { Strava } from "../src/strava";

async function main() {
  const config = await Firestore.getConfig();
  try {
    const newToken = await Strava.getToken(config.stravaClientId, config.stravaClientSecret, config.stravaRefreshToken);
    console.log(newToken);
  } catch (error) {
    if (axios.isAxiosError(error)) {
      console.log(`Could not get token: ${error.message}`);
    }
  }
}

main();
