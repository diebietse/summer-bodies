// Run with: npm run ts ./examples/create-activity.ts
// Requires:
// * Valid config loaded on firestore (including strava credentials)
// * A service-account.json file with a firestore service account in the project root directory

import { Firestore } from "../src/firestore";
import { Strava } from "../src/strava";
import { Bot } from "../src/bot";

async function createActivity() {
  const config = await Firestore.getConfig();
  const newToken = await Strava.getToken(config.stravaClientId, config.stravaClientSecret, config.stravaRefreshToken);
  const strava = new Strava(newToken.access_token, config.stravaBotId, config.stravaClubs);

  await Bot.createWeeklyPlaceholder(strava);
}

createActivity();
