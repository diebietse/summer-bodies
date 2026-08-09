// Run with: npm run ts ./examples/audit-athlete-activities.ts
// Requires:
// * Valid config loaded on firestore (including strava credentials)
// * A service-account.json file with a firestore service account in the project root directory
// * Some activities this week in the configured Strava club

import { Firestore } from "../src/firestore";
import { Strava } from "../src/strava";
import { previousWeekUnix, currentWeekUnix, now } from "../src/util";

const athleteName = "Strava";

async function printResults() {
  const config = await Firestore.getConfig();
  const strava = new Strava(config.stravaClientId, config.stravaClientSecret);
  const athletes = await Firestore.getRegisteredAthletes();
  const selectedAthlete = athletes.filter((athlete) => athlete.firstname.includes(athleteName));
  // selectedAthlete[0].refreshToken = "";
  const result = await strava.getAllAthletesActivities(
    selectedAthlete,
    previousWeekUnix(),
    currentWeekUnix(),
    // now()
  );

  if (result.error) {
    console.log("Could not get all athlete activities");
    return;
  }

  for (const athlete of result.athletesWithActivities) {
    console.log(`Results for '${athlete.firstname} ${athlete.lastname}' (https://www.strava.com/athletes/${athlete.id})`);
    for (const activity of athlete.activities) {
      console.log(
        `Activity name: '${activity.name}', Type: '${activity.type}' , Moving time: '${Math.round(
          activity.moving_time / 60,
        )}min', Elapsed time: '${Math.round(activity.elapsed_time / 60)}min'`,
      );
    }
  }
}

printResults();
