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
        elapsed_time: 60 * 30,
        total_elevation_gain: 1,
        name: "I cycled too much",
        start_date: "now",
        average_speed: 0.549,
      },
      {
        id: 2,
        type: "Golf",
        distance: 1,
        moving_time: 60 * 30,
        elapsed_time: 60 * 30,
        total_elevation_gain: 1,
        name: "I cycled too much",
        start_date: "now",
        average_speed: 0.549,
      },
    ],
  },
];

async function getProgress() {
  const progress = Challenge.calculateGoalResults(activities, 10);
  console.log(JSON.stringify(progress, null, 2));
}

getProgress();
