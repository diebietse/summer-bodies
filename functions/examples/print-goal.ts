// Run with: npm run ts ./examples/print-goal.ts
// Requires:
// * Valid config loaded on firestore (including strava credentials)
// * A service-account.json file with a firestore service account in the project root directory
// * Some activities this week in the configured Strava club

import { Challenge } from "../src/challenge";
import { Format } from "../src/format";
import { Firestore } from "../src/firestore";
import { Strava } from "../src/strava";
import { getCurrentWeekUnix, now } from "../src/util";

async function printProgress() {
  const config = await Firestore.getConfig();
  const strava = new Strava(config.stravaClientId, config.stravaClientSecret);

  const athletes = await Firestore.getRegisteredAthletes();
  const allActivities = await strava.getAllAthletesActivities(athletes, getCurrentWeekUnix(), now());
  const progress = await Challenge.calculateProgress(allActivities);
  console.log(Format.goalStatus("In Progress Goal Status", progress));
}

printProgress();
