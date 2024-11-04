// Run with: npm run ts ./examples/save-activities-to-file.ts
// Requires:
// * Valid config loaded on firestore (including strava credentials)
// * A service-account.json file with a firestore service account in the project root directory
// * Some activities this week in the configured Strava club

import { Firestore } from "../src/firestore";
import { Strava } from "../src/strava";
import { weeksAgo } from "../src/util";
import { writeFileSync } from "fs";

const end = weeksAgo(7);
const start = end.clone().subtract(1, "week");

async function printResults() {
  const config = await Firestore.getConfig();
  const strava = new Strava(config.stravaClientId, config.stravaClientSecret);

  console.log(`Fetching list of athletes from Firestore`);
  const athletes = await Firestore.getRegisteredAthletes();

  console.log(`Fetching activities from ${start.format("YYYY-MM-DD")} to ${end.format("YYYY-MM-DD")}`);
  const athletesWithActivities = await strava.getAllAthletesActivities(athletes, start.unix(), end.unix());

  const fileName = `athletesWithActivities-${end.format("YYYY-MM-DD")}.json`;
  console.log(`Saving activities to '${fileName}'`);
  writeFileSync(fileName, JSON.stringify(athletesWithActivities));
  // const loadedAthletesWithActivities = JSON.parse(readFileSync("athletesWithActivities.json", "utf8"));
}

printResults();
