// Run with: npm run ts ./examples/calculate-progress.ts

import { Challenge } from "../src/challenge";
import { OurEvent } from "../src/challenge-models";

const activities: OurEvent[] = [
  {
    scrapeTime: new Date(),
    id: "some-event-id",
    athleteId: "some-athlete-id",
    type: "Cycling",
    distance: 1,
    movingTime: 60 * 30,
    elapsedTime: 1,
    totalElevationGain: 1,
    firstName: "John",
    lastName: "Smith",
    club: "The Best Club",
    eventName: "I cycled too much",
  },
];

async function getProgress() {
  const progress = await Challenge.calculateProgress(activities);
  console.log(JSON.stringify(progress, null, 2));
}

getProgress();
