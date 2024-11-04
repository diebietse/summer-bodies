// Run with: npm run ts ./examples/calculate-totals.ts

import { AthleteWithActivities } from "../src/challenge-models";

import { readFileSync } from "fs";

async function printResults() {
  for (const date of [
    "2024-08-26",
    "2024-09-02",
    "2024-09-09",
    "2024-09-16",
    "2024-09-23",
    "2024-09-30",
    "2024-10-07",
    "2024-10-14",
    "2024-10-21",
    "2024-10-28",
    "2024-11-04",
  ]) {
    const totalTime = calculateTotal(date);
    console.log(`Total moving time for ${date}: ${Math.floor(totalTime / 60 / 60)}h`);
  }
  console.log(`Total hours in a week: ${7 * 24}h`);

  let monthTotal = 0;
  for (const date of [
    "2024-09-02",
    "2024-09-09",
    "2024-09-16",
    "2024-09-23",
    "2024-09-30",
    "2024-10-07",
    "2024-10-14",
    "2024-10-21",
    "2024-10-28",
  ]) {
    monthTotal += calculateTotal(date);
  }
  console.log(`Total moving time for Challenge: ${Math.floor(monthTotal / 60 / 60)}h`);
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
