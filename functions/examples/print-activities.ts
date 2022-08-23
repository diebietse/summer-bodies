// Run with: npm run ts ./examples/print-activities.ts
// Requires:
// * Valid config loaded on firestore (including strava credentials)
// * A service-account.json file with a firestore service account in the project root directory

import { Challenge } from "../src/challenge";
import { Format } from "../src/format";
import { Firestore } from "../src/firestore";
import axios from "axios";
import { Strava } from "../src/strava";
import { getCurrentWeekUnix, getPreviousWeekUnix } from "../src/util";

async function printActivities() {
  const config = await Firestore.getConfig();
  const strava = new Strava(config.stravaClientId, config.stravaClientSecret);
  const athletes = await Firestore.getRegisteredAthletes();

  try {
    let athletesWithActivities = await strava.getAllAthletesActivities(
      athletes,
      getPreviousWeekUnix(),
      getCurrentWeekUnix()
    );
    const progress = await Challenge.calculateProgress(athletesWithActivities);
    console.log(Format.goalStatus("In Progress Goal Status", progress));
  } catch (error) {
    if (axios.isAxiosError(error)) {
      console.log(`Could not get activities: ${error.message}`);
    }
    process.exit(1);
  }
}

printActivities();
