// Run with: npm run ts ./examples/save-activities-to-file.ts
// Requires:
// * Valid config loaded on firestore (including strava credentials)
// * A service-account.json file with a firestore service account in the project root directory
// * Some activities this week in the configured Strava club

import { Firestore } from "../src/firestore";
import { Strava } from "../src/strava";
import { writeFileSync } from "fs";
import moment from "moment";

async function printResults() {
  const config = await Firestore.getConfig();
  const strava = new Strava(config.stravaClientId, config.stravaClientSecret);
  const athletes = await Firestore.getRegisteredAthletes();
  const athletesWithActivities = await strava.getAllAthletesActivities(athletes, weeksAgo(1), weeksAgo(0));

  writeFileSync("athletesWithActivities-2022-09-26.json", JSON.stringify(athletesWithActivities));
  // const loadedAthletesWithActivities = JSON.parse(readFileSync("athletesWithActivities.json", "utf8"));
}

printResults();

export function weeksAgo(weeksAgo: number): number {
  let now = moment.utc();
  const lastWeek = now.subtract(weeksAgo, "weeks");
  return lastWeek.startOf("isoWeek").unix();
}
