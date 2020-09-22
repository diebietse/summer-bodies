// Run with: npm run ts ./examples/print-fitcoin.ts
// Requires:
// * Valid config loaded on firestore (including strava credentials)
// * A service-account.json file with a firestore service account in the project root directory
// * Some activities this week in the configured Stava club

import { Challenge } from "../src/challenge";
import { Format } from "../src/format";
import { Firestore } from "../src/firestore";
import { Strava } from "../src/strava";

async function printFitcoin() {
  const config = await Firestore.getConfig();
  const newToken = await Strava.getToken(config.stravaClientId, config.stravaClientSecret, config.stravaRefreshToken);
  const strava = new Strava(newToken.access_token, config.stravaBotId, config.stravaClubs);

  const allActivities = await strava.getThisWeeksActivitiesAllClubs();
  const contestantFitcoins = await Challenge.calculateFitcoin(allActivities);

  console.log(Format.fitcoinStatus("This Week's Possible Fitcoin so far", contestantFitcoins));
}

printFitcoin();
