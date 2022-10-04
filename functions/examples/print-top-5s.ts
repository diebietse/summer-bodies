// Run with: npm run ts ./examples/print-top-5s.ts
// Requires:
// * Valid config loaded on firestore (including strava credentials)
// * A service-account.json file with a firestore service account in the project root directory
// * Some activities this week in the configured Strava club

import { Challenge } from "../src/challenge";
import { Format } from "../src/format";
// import { Firestore } from "../src/firestore";
// import { Strava } from "../src/strava";
import { readFileSync } from "fs";

// import { getPreviousWeekUnix, getCurrentWeekUnix } from "../src/util";

async function printResults() {
  // const config = await Firestore.getConfig();
  // const strava = new Strava(config.stravaClientId, config.stravaClientSecret);
  // const athletes = await Firestore.getRegisteredAthletes();
  // const athletesWithActivities = await strava.getAllAthletesActivities(
  //   athletes,
  //   getPreviousWeekUnix(),
  //   getCurrentWeekUnix()
  // );
  // const athletesWithActivities = await strava.getAllAthletesActivities(athletes, getCurrentWeekUnix(), now());
  const athletesWithActivities = JSON.parse(readFileSync("athletesWithActivities-2022-09-26.json", "utf8"));

  let clubs = await Challenge.calculateActivities(athletesWithActivities);

  for (const club of clubs) {
    console.log(Format.finalClubTop5(club));
  }
}

printResults();
