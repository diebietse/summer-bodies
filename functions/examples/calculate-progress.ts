// Run with: npm run ts ./examples/calculate-progress.ts

import { Challenge } from "../src/challenge";
import { AthleteWithActivities } from "../src/challenge-models";

const activities: AthleteWithActivities[] = [
  {
    id: "some-athlete-id",
    firstname: "John",
    lastname: "Smith",
    club: "The Best Club",
    profile: "",
    refreshToken: "",
    activities: [
      {
        id: 1,
        type: "Golf",
        distance: 1,
        moving_time: 60 * 30,
        total_elevation_gain: 1,
        name: "I cycled too much",
        start_date: "now",
      },
      {
        id: 2,
        type: "Golf",
        distance: 1,
        moving_time: 60 * 30,
        total_elevation_gain: 1,
        name: "I cycled too much",
        start_date: "now",
      },
    ],
  },
];

async function getProgress() {
  const progress = await Challenge.calculateProgress(activities);
  console.log(JSON.stringify(progress, null, 2));
}

getProgress();
