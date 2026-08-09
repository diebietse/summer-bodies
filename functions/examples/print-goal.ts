// Run with: npm run ts ./examples/print-goal.ts
// Requires:
// * Valid config loaded on firestore (including strava credentials)
// * A service-account.json file with a firestore service account in the project root directory
// * Some activities this week in the configured Strava club

import { Challenge } from "../src/challenge";
import { Format } from "../src/format";
import { readFileSync } from "fs";

async function printProgress() {
  const allActivities = JSON.parse(readFileSync("excluded/athletesWithActivities-2025-09-15.json", "utf8"));
  const goalResults = Challenge.calculateGoalResults(allActivities, 10);
  console.log(Format.goalStatus("In Progress Goal Status", goalResults));
}

printProgress();
