// Run with: npm run ts ./examples/print-top-5s.ts
// Requires:
// * Valid config loaded on firestore (including strava credentials)
// * A service-account.json file with a firestore service account in the project root directory
// * Some activities this week in the configured Strava club

import { Challenge } from "../src/challenge";
import { Format } from "../src/format";
import { Firestore } from "../src/firestore";
import { Strava } from "../src/strava";
import { getPreviousWeekUnix, getCurrentWeekUnix } from "../src/util";

async function printResults() {
  const config = await Firestore.getConfig();
  const strava = new Strava(config.stravaClientId, config.stravaClientSecret);
  const athletes = await Firestore.getRegisteredAthletes();
  let athletesWithActivities = await strava.getAllAthletesActivities(
    athletes,
    getPreviousWeekUnix(),
    getCurrentWeekUnix()
  );

  let clubs = await Challenge.calculateActivities(athletesWithActivities);

  for (const club of clubs) {
    console.log(Format.inProgressClubTop5(club));
  }
}

printResults();
