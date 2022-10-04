// Run with: npm run ts ./examples/print-total-fitcoin.ts
// Requires:
// * Valid config loaded on firestore (including strava credentials)
// * A service-account.json file with a firestore service account in the project root directory
// * Some activities this week in the configured Strava club

import { Firestore } from "../src/firestore";

async function printResults() {
  const totalFitcoin = await Firestore.getFitcoinTotals();
  for (const contestant of totalFitcoin) {
    console.log(`${contestant.name},${contestant.fitcoin}`)
  }
}

printResults();
