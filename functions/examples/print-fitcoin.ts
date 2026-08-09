// Run with: npm run ts ./examples/print-fitcoin.ts
// Requires:
// * Valid config loaded on firestore (including strava credentials)
// * A service-account.json file with a firestore service account in the project root directory
// * Some activities this week in the configured Strava club

import { Challenge } from "../src/challenge";
import { AthleteWithActivities } from "../src/challenge-models";
import { Format } from "../src/format";
import { readFileSync } from "fs";

async function printFitcoin() {
  try {
    const athletesWithActivities: AthleteWithActivities[] = JSON.parse(readFileSync("excluded/athletesWithActivities-2024-10-28.json", "utf8"));
    const results = Challenge.calculateResults(athletesWithActivities);
    const contestantFitcoins = Challenge.calculateFitcoin(results);
    console.log(Format.fitcoinStatus("This Week's Possible Fitcoin so far", contestantFitcoins));
  } catch (error) {
    console.log(`Could not calculate fitcoin: ${error}`);
    process.exit(1);
  }
}

printFitcoin();
