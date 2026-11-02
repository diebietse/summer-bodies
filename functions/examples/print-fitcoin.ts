// Run with: npm run ts ./examples/print-fitcoin.ts
// Requires:
// * An excluded/athletesWithActivities-<date>.json file (see save-activities-to-file.ts) —
//   update the hardcoded filename below to match

import { Challenge } from "../src/challenge";
import { AthleteWithActivities } from "../src/challenge-models";
import { readFileSync } from "fs";

async function printFitcoin() {
  try {
    const athletesWithActivities: AthleteWithActivities[] = JSON.parse(readFileSync("excluded/athletesWithActivities-2024-10-28.json", "utf8"));
    const results = Challenge.calculateResults(athletesWithActivities);
    const contestantFitcoins = Challenge.calculateFitcoin(results);
    console.log("This week's possible FitCoin so far");
    console.table(contestantFitcoins);
  } catch (error) {
    console.log(`Could not calculate fitcoin: ${error}`);
    process.exit(1);
  }
}

printFitcoin();
