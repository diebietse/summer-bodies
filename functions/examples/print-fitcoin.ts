// Run with: npm run ts ./examples/print-fitcoin.ts
// Requires:
// * Valid config loaded on firestore (including strava credentials)
// * A service-account.json file with a firestore service account in the project root directory
// * Some activities this week in the configured Strava club

import { Challenge } from "../src/challenge";
import { AthleteWithActivities } from "../src/challenge-models";
import { Format } from "../src/format";
// import { Firestore } from "../src/firestore";
// import { Strava } from "../src/strava";
import axios from "axios";
// import { getCurrentWeekUnix, getPreviousWeekUnix } from "../src/util";
import { readFileSync } from "fs";

async function printFitcoin() {
  // const config = await Firestore.getConfig();
  // const strava = new Strava(config.stravaClientId, config.stravaClientSecret);
  // const athletes = await Firestore.getRegisteredAthletes();

  try {
    const athletesWithActivities: AthleteWithActivities[] = JSON.parse(
      readFileSync("athletesWithActivities-2024-10-28.json", "utf8")
    );

    // let athletesWithActivities = await strava.getAllAthletesActivities(
    //   athletes,
    //   getPreviousWeekUnix(),
    //   getCurrentWeekUnix()
    // );
    const results = Challenge.calculateResults(athletesWithActivities);
    // let _unused = results;

    const contestantFitcoins = Challenge.calculateFitcoin(results);
    console.log(Format.fitcoinStatus("This Week's Possible Fitcoin so far", contestantFitcoins));
  } catch (error) {
    if (axios.isAxiosError(error)) {
      console.log(`Could not get activities: ${error.message}`);
    }
    process.exit(1);
  }
}

printFitcoin();
