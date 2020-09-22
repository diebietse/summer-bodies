// Run with: npm run ts ./examples/format.ts

import { Format } from "../src/format";
import { StravaEvent, ActivityType } from "../src/challenge-models";

const event: StravaEvent = {
  name: ActivityType.OnWheels,
  groupings: [
    {
      name: "MOST DISTANCE",
      unit: "km",
      contestants: [
        { name: "R W.", total: 5 },
        { name: "Arno V.", total: 5 },
      ],
    },
    {
      name: "MOST CLIMBING",
      unit: "m",
      contestants: [
        { name: "R W.", total: 50 },
        { name: "Arno V.", total: 500 },
      ],
    },
    {
      name: "MOST MOVING TIME",
      unit: "min",
      contestants: [
        { name: "R W.", total: 50 },
        { name: "Arno V.", total: 500 },
      ],
    },
  ],
};

function printResults() {
  console.log("Top 5:");
  console.log(Format.eventTop5Table(event, "Some Club"));
}

printResults();
