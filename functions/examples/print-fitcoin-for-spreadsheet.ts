// Run with: npm run ts ./examples/print-fitcoin-for-spreadsheet.ts
// Requires:
// * A service-account.json file with a firestore service account in the project root directory
// * Fitcoin totals already stored in firestore (see add-old-fitcoin.ts or a completed weekly run)

import { Firestore } from "../src/firestore";
import axios from "axios";
import { shuffle } from "../src/util";

async function printFitcoin() {
  try {
    const totalFitcoin = await Firestore.getFitcoinTotals();
    const totalFitcoinRandomized = shuffle(totalFitcoin);
    totalFitcoinRandomized.forEach((contestant) => {
      console.log(`${contestant.name},${contestant.fitcoin}`);
    });
  } catch (error) {
    if (axios.isAxiosError(error)) {
      console.log(`Could not get total fitcoin: ${error.message}`);
    }
    process.exit(1);
  }
}

printFitcoin();
