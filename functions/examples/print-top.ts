// Run with: npm run ts ./examples/print-top.ts
// Requires:
// * An excluded/athletesWithActivities-<date>.json file (see save-activities-to-file.ts) —
//   update the hardcoded filename below to match
// Writes the calculated results to excluded/calculateResults.json

import { Challenge } from "../src/challenge";
import { Format } from "../src/format";
import { readFileSync, writeFileSync } from "fs";
import { now, weeksAgoUnix } from "../src/util";

async function printResults() {
  const athletesWithActivities = JSON.parse(readFileSync("excluded/athletesWithActivities-2025-10-13.json", "utf8"));

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

  results.topResults.forEach((event) => {
    const eventTableString = Format.finalEventTop(event);
    if (eventTableString) {
      console.log(eventTableString);
    }
  });
}

printResults();
