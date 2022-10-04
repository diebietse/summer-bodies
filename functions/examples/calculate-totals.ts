// Run with: npm run ts ./examples/calculate-totals.ts
// Requires:
// * Valid config loaded on firestore (including strava credentials)
// * A service-account.json file with a firestore service account in the project root directory
// * Some activities this week in the configured Strava club

// import { Challenge } from "../src/challenge";
import { AthleteWithActivities } from "../src/challenge-models";

// import { Format } from "../src/format";
// import { Firestore } from "../src/firestore";
// import { Strava } from "../src/strava";
import { readFileSync } from "fs";

// import { getPreviousWeekUnix, getCurrentWeekUnix } from "../src/util";

async function printResults() {
  for (const date of [
    "2022-08-15",
    "2022-08-22",
    "2022-08-29",
    "2022-09-05",
    "2022-09-12",
    "2022-09-19",
    "2022-09-26",
  ]) {
    const totalTime = calculateTotal(date);
    console.log(`Total moving time for ${date}: ${Math.floor(totalTime / 60 / 60)}h`);
  }
  console.log(`Total hours in a week: ${7 * 24}h`);

  let monthTotal = 0
  for (const date of ["2022-09-05", "2022-09-12", "2022-09-19", "2022-09-26"]) {
    monthTotal += calculateTotal(date);
  }
  console.log(`Total moving time for September: ${Math.floor(monthTotal / 60 / 60)}h`);
}

function calculateTotal(date: string): number {
  const athletes = loadActivities(date);
  let totalTime = 0;
  for (const athlete of athletes) {
    for (const activity of athlete.activities) {
      totalTime += activity.moving_time;
    }
  }
  return totalTime;
}

function loadActivities(date: string): AthleteWithActivities[] {
  return JSON.parse(readFileSync(`athletesWithActivities-${date}.json`, "utf8"));
}

printResults();
