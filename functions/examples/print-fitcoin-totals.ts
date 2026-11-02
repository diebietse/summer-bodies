// Run with: npm run ts ./examples/print-fitcoin-totals.ts
// Requires:
// * A service-account.json file with a firestore service account in the project root directory
// * Fitcoin totals already stored in firestore (see add-old-fitcoin.ts or a completed weekly run) - only the
//   configured challenge's weeks count (see draw.ts's isChallengeAward)

import { Firestore } from "../src/firestore";
import axios from "axios";

async function printFitcoin() {
  try {
    const config = await Firestore.getConfig();
    const totalFitcoin = await Firestore.getFitcoinTotals({ startDate: config.challengeStartDate, endDate: config.challengeEndDate });
    console.table(totalFitcoin);
  } catch (error) {
    if (axios.isAxiosError(error)) {
      console.log(`Could not get total fitcoin: ${error.message}`);
    }
    process.exit(1);
  }
}

printFitcoin();
