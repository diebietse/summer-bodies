// Run with: npm run ts ./examples/print-athlete-activities.ts
// Requires:
// * Valid config loaded on firestore (including strava credentials)
// * A service-account.json file with a firestore service account in the project root directory

import { Challenge } from "../src/challenge";
import { Format } from "../src/format";
import { Athlete } from "../src/challenge-models";
import { Firestore } from "../src/firestore";
import axios from "axios";
import { Strava } from "../src/strava";
import { getCurrentWeekUnix, getPreviousWeekUnix } from "../src/util";

async function printActivities() {
  const config = await Firestore.getConfig();
  const strava = new Strava(config.stravaClientId, config.stravaClientSecret);
  const athletes = await Firestore.getRegisteredAthletes();

  const athlete = getAthleteById(60796219, athletes);
  if (athlete === undefined) {
    console.log(`Could not find athlete`);
    process.exit(1);
  }
  try {
    let athletesWithActivities = await strava.getAllAthletesActivities(
      [athlete],
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

function getAthleteById(id: number, athletes: Athlete[]): Athlete | undefined {
  for (const athlete of athletes) {
    if (athlete.id === id) return athlete;
  }

  return undefined;
}
printActivities();
