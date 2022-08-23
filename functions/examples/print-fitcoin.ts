// Run with: npm run ts ./examples/print-fitcoin.ts
// Requires:
// * Valid config loaded on firestore (including strava credentials)
// * A service-account.json file with a firestore service account in the project root directory
// * Some activities this week in the configured Strava club

import { Challenge } from "../src/challenge";
import { Format } from "../src/format";
import { Firestore } from "../src/firestore";
import { Strava } from "../src/strava";
import axios from "axios";
import { getCurrentWeekUnix, getPreviousWeekUnix } from "../src/util";

async function printFitcoin() {
  const config = await Firestore.getConfig();
  const strava = new Strava(config.stravaClientId, config.stravaClientSecret);
  const athletes = await Firestore.getRegisteredAthletes();

  try {
    let athletesWithActivities = await strava.getAllAthletesActivities(athletes, getPreviousWeekUnix(), getCurrentWeekUnix());
    const contestantFitcoins = await Challenge.calculateFitcoin(athletesWithActivities);
    console.log(Format.fitcoinStatus("This Week's Possible Fitcoin so far", contestantFitcoins));
  } catch (error) {
    if (axios.isAxiosError(error)) {
      console.log(`Could not get activities: ${error.message}`);
    }
    process.exit(1);
  }

}

printFitcoin();
