// Run with: npm run ts ./examples/check-athlete-tokens.ts
// Requires:
// * A service-account.json file with a firestore service account in the project root directory
//
// Refreshes every registered athlete's stored Strava token and reports which ones are invalid/revoked. Useful
// after a Slack alert like "Could not get all athletes' Strava activities" - getAllAthletesActivities treats
// any single athlete's failed refresh as a whole-batch failure (see functions/src/bot.ts), so daily/weekly
// results generation stops for everyone until the bad token is found and that athlete removed (see
// examples/remove-athlete.ts).
//
// Strava rotates the refresh token on every use, so a successful check immediately persists the newly-issued
// token back to Firestore - otherwise this script would itself break the very tokens it just confirmed work.

import { Firestore } from "../src/firestore";
import { Strava } from "../src/strava";
import { errorMessage } from "../src/errorReporting";

async function checkAthleteTokens() {
  const config = await Firestore.getConfig();
  const athletes = await Firestore.getRegisteredAthletes();

  const broken: { id: string; name: string; reason: string }[] = [];

  for (const athlete of athletes) {
    const name = `${athlete.firstname} ${athlete.lastname}`;
    try {
      const newToken = await Strava.getToken(config.stravaClientId, config.stravaClientSecret, athlete.refreshToken);
      await Firestore.updateAthletesRefreshToken([{ ...athlete, refreshToken: newToken.refresh_token }]);
      console.log(`OK    ${athlete.id}  ${name}`);
    } catch (error) {
      const reason = errorMessage(error);
      broken.push({ id: athlete.id, name, reason });
      console.log(`FAIL  ${athlete.id}  ${name}  -  ${reason}`);
    }
  }

  console.log(`\n${athletes.length - broken.length}/${athletes.length} athlete tokens OK.`);
  if (broken.length > 0) {
    console.log(`\nBroken tokens block results generation for everyone until removed. Fix with:`);
    broken.forEach((athlete) => console.log(`  npm run ts ./examples/remove-athlete.ts -- --id ${athlete.id}`));
  }
}

checkAthleteTokens();
