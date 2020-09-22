// Run with: npm run ts ./examples/get-club-events.ts
// Requires:
// * Valid config loaded on firestore
// * A service-account.json file with a firestore service account in the project root directory

import { Strava } from "../src/strava";
import { Firestore } from "../src/firestore";

async function getClubEvents() {
  try {
    const config = await Firestore.getConfig();
    const newToken = await Strava.getToken(config.stravaClientId, config.stravaClientSecret, config.stravaRefreshToken);
    const strava = new Strava(newToken.access_token, config.stravaBotId, config.stravaClubs);

    const allActivities = await strava.getThisWeeksActivitiesAllClubs();
    console.log(`club events received`, allActivities);
  } catch (e) {
    console.error(e.response?.data);
  }
}

getClubEvents();
