// Run with: npm run ts ./examples/audit-athlete-activities.ts
// Requires:
// * Valid config loaded on firestore (including strava credentials)
// * A service-account.json file with a firestore service account in the project root directory
// * Some activities this week in the configured Strava club

import { Firestore } from "../src/firestore";
import { Strava } from "../src/strava";
import { getPreviousWeekUnix, getCurrentWeekUnix } from "../src/util";

const athleteName = "Jedri";

async function printResults() {
  const config = await Firestore.getConfig();
  const strava = new Strava(config.stravaClientId, config.stravaClientSecret);
  const athletes = await Firestore.getRegisteredAthletes();
  const selectedAthlete = athletes.filter((athlete) => athlete.firstname.includes(athleteName));
  const athletesWithActivities = await strava.getAllAthletesActivities(
    selectedAthlete,
    getPreviousWeekUnix(),
    getCurrentWeekUnix()
  );

  for (const athlete of athletesWithActivities) {
    console.log(`Results for '${athlete.firstname} ${athlete.lastname}'`);
    for (const activity of athlete.activities) {
      console.log(`Activity name: '${activity.name}', Moving time: '${Math.round(activity.moving_time / 60)}min'`);
    }
  }
}

printResults();
