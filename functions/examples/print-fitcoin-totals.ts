// Run with: npm run ts ./examples/print-fitcoin-totals.ts
// Requires:
// * Valid config loaded on firestore (including strava credentials)
// * A service-account.json file with a firestore service account in the project root directory
// * Some activities this week in the configured Strava club

import { Firestore } from "../src/firestore";
import axios from "axios";
import { Format } from "../src/format";

async function printFitcoin() {
  try {
    const totalFitcoin = await Firestore.getFitcoinTotals();
    console.log(Format.fitcoinStatus("Total Fitcoin Results", totalFitcoin));
  } catch (error) {
    if (axios.isAxiosError(error)) {
      console.log(`Could not get total fitcoin: ${error.message}`);
    }
    process.exit(1);
  }
}

printFitcoin();
