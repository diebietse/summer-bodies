// Run with: npm run ts ./examples/strava-refresh-token.ts

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
