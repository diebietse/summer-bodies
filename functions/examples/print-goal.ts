// Run with: npm run ts ./examples/print-goal.ts
// Requires:
// * Valid config loaded on firestore (including strava credentials)
// * A service-account.json file with a firestore service account in the project root directory
// * Some activities this week in the configured Stava club

import { Challenge } from "../src/challenge";
import { Format } from "../src/format";
import { Firestore } from "../src/firestore";
import { Strava } from "../src/strava";

async function printProgress() {
  const config = await Firestore.getConfig();
  const newToken = await Strava.getToken(config.stravaClientId, config.stravaClientSecret, config.stravaRefreshToken);
  const strava = new Strava(newToken.access_token, config.stravaBotId, config.stravaClubs);

  const allActivities = await strava.getLastWeeksActivitiesAllClubs();
  const progress = await Challenge.calculateProgress(allActivities);
  console.log(Format.goalStatus("In Progress Goal Status", progress));
}

printProgress();
