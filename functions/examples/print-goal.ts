// Run with: npm run ts ./examples/print-goal.ts
// Requires:
// * An excluded/athletesWithActivities-<date>.json file (see save-activities-to-file.ts) —
//   update the hardcoded filename below to match

import { Challenge } from "../src/challenge";
import { Format } from "../src/format";
import { readFileSync } from "fs";

async function printProgress() {
  const allActivities = JSON.parse(readFileSync("excluded/athletesWithActivities-2025-09-15.json", "utf8"));
  const goalResults = Challenge.calculateGoalResults(allActivities, 10);
  console.log(Format.goalStatus("In Progress Goal Status", goalResults));
}

printProgress();
