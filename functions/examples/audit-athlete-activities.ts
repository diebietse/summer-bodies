// Run with: npm run ts ./examples/audit-athlete-activities.ts -- --name "Nomzamo" [--week current|last]
//
// --name matches (case-insensitively) any part of a registered athlete's full name; --week defaults to current.
// Requires:
// * Valid config loaded on firestore (including strava credentials)
// * A service-account.json file with a firestore service account in the project root directory

import { Firestore } from "../src/firestore";
import { Strava } from "../src/strava";
import { Challenge } from "../src/challenge";
import { ActivityType } from "../src/challenge-models";
import { currentWeekUnix, now, previousWeekUnix } from "../src/util";
import { parseArgs } from "node:util";

const {
  values: { name, week = "current" },
} = parseArgs({
  options: {
    name: { type: "string" },
    week: { type: "string" },
  },
});

if (!name || (week !== "current" && week !== "last")) {
  console.error('Usage: npm run ts ./examples/audit-athlete-activities.ts -- --name "Nomzamo" [--week current|last]');
  process.exit(1);
}

const [startUnix, endUnix] = week === "last" ? [previousWeekUnix(), currentWeekUnix()] : [currentWeekUnix(), now()];

async function printResults() {
  const config = await Firestore.getConfig();
  const strava = new Strava(config.stravaClientId, config.stravaClientSecret);
  const athletes = await Firestore.getRegisteredAthletes();
  const selectedAthletes = athletes.filter((athlete) => `${athlete.firstname} ${athlete.lastname}`.toLowerCase().includes(name!.toLowerCase()));
  if (selectedAthletes.length === 0) {
    console.log(`No registered athlete matches '${name}'`);
    return;
  }

  const result = await strava.getAllAthletesActivities(selectedAthletes, startUnix, endUnix);
  if (result.error) {
    console.log(`Could not get activities for: ${result.failedAthletes.join(", ")}`);
  }

  for (const athlete of result.athletesWithActivities) {
    console.log(`Results for '${athlete.firstname} ${athlete.lastname}' (https://www.strava.com/athletes/${athlete.id})`);
    for (const activity of athlete.activities) {
      const distance =
        Challenge.toOurActivity(activity.type) === ActivityType.OnFoot ? `, Distance: '${(activity.distance / 1000).toFixed(2)}km'` : "";
      console.log(
        `Date: '${activity.start_date_local}', Activity name: '${activity.name}', Type: '${activity.type}' , Moving time: '${Math.round(
          activity.moving_time / 60,
        )}min', Elapsed time: '${Math.round(activity.elapsed_time / 60)}min'${distance}`,
      );
    }
  }
}

printResults();
