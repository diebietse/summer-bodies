// Run with: npm run ts ./examples/print-top.ts
// Requires:
// * Valid config loaded on firestore (including strava credentials)
// * A service-account.json file with a firestore service account in the project root directory
// * Some activities this week in the configured Strava club

import { Challenge } from "../src/challenge";
import { Format } from "../src/format";
// import { Firestore } from "../src/firestore";
// import { Strava } from "../src/strava";
// import { getPreviousWeekUnix, getCurrentWeekUnix } from "../src/util";
// import { readFileSync } from "fs";
import { readFileSync, writeFileSync } from "fs";
// import { Firestore } from "../src/firestore";
import { now, weeksAgoUnix } from "../src/util";

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
  // const athletesWithActivities = JSON.parse(readFileSync("athletesWithActivities.json", "utf8"));
  // const athletesWithActivities = JSON.parse(readFileSync("athletesWithActivities-2024-10-28.json", "utf8"));
  const athletesWithActivities = JSON.parse(readFileSync("excluded/athletesWithActivities-2025-10-13.json", "utf8"));

  // let events = Challenge.getChallengeEvents(athletesWithActivities);
  let results = Challenge.calculateResults(athletesWithActivities);

  const start = weeksAgoUnix(0);
  const timeNow = now();
  const end = weeksAgoUnix(-1);
  results.startDate = start;
  results.endDate = end;
  results.currentTime = timeNow;
  const fileName = `excluded/calculateResults.json`;
  console.log(`Saving calculateResults to '${fileName}'`);
  writeFileSync(fileName, JSON.stringify(results));

  results.topResults.forEach(async (event) => {
    const eventTableString = Format.finalEventTop(event);
    // const eventTableString = Format.inProgressEventTop(event);
    if (eventTableString) {
      console.log(eventTableString);
    }
  });

  // const id = crypto.randomUUID();
  // await Firestore.storeResults(id, JSON.stringify(results));
}

printResults();
