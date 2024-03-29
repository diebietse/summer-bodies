// Run with: npm run ts ./examples/save-activities-to-file.ts
// Requires:
// * Valid config loaded on firestore (including strava credentials)
// * A service-account.json file with a firestore service account in the project root directory
// * Some activities this week in the configured Strava club

import { Firestore } from "../src/firestore";
import { Strava } from "../src/strava";
import { now, getCurrentWeekUnix } from "../src/util";
import { writeFileSync } from "fs";

async function printResults() {
  const config = await Firestore.getConfig();
  const strava = new Strava(config.stravaClientId, config.stravaClientSecret);
  const athletes = await Firestore.getRegisteredAthletes();
  const athletesWithActivities = await strava.getAllAthletesActivities(athletes, getCurrentWeekUnix(), now());

  writeFileSync("athletesWithActivities.json", JSON.stringify(athletesWithActivities));
  // const loadedAthletesWithActivities = JSON.parse(readFileSync("athletesWithActivities.json", "utf8"));
}

printResults();
