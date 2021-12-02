// Run with: npm run ts ./examples/print-total-fitcoin.ts
// Requires:
// * Valid config loaded on firestore (including strava credentials)
// * A service-account.json file with a firestore service account in the project root directory
// * Some activities this week in the configured Stava club

import { Format } from "../src/format";
import { Firestore } from "../src/firestore";

async function printFitcoin() {
  const totalFitcoin = await Firestore.getFitcoinTotals();
  console.log(Format.fitcoinStatus("Total Fitcoin Results", totalFitcoin));
}

printFitcoin();
