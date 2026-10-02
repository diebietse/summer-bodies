// Run with: npm run ts ./examples/remove-athlete.ts -- --id 12345
//       or: npm run ts ./examples/remove-athlete.ts -- --name "First Last"
// Requires:
// * A service-account.json file with a firestore service account in the project root directory
//
// Revokes the athlete's authorization on Strava's side, then deletes their registration (profile + stored
// refresh token), stored activities, and current-challenge streak doc. Use this to honor a deauthorization/
// data-deletion request, per the Strava API Agreement's termination clause (https://www.strava.com/legal/api)
// - deleting only our own copy of their data (without revoking) would leave Strava still counting this
// athlete as "connected" indefinitely, since nothing ever told Strava the grant should end.
//
// It's also the fix if daily/weekly results generation has stopped for everyone: a revoked or otherwise
// invalid refresh token fails that athlete's Strava fetch, and getAllAthletesActivities treats any single
// athlete's failure as a whole-batch failure - see functions/src/bot.ts. In that case the revoke call below
// is expected to fail (the token's already dead) - that's fine, it's logged and the local cleanup proceeds
// regardless.

import { parseArgs } from "node:util";
import { Firestore } from "../src/firestore";
import { Strava } from "../src/strava";
import { Athlete } from "../src/challenge-models";
import { errorMessage } from "../src/errorReporting";

const {
  values: { id, name },
} = parseArgs({
  options: {
    id: { type: "string" },
    name: { type: "string" },
  },
});

if (!id && !name) {
  console.error(
    'Usage: npm run ts ./examples/remove-athlete.ts -- --id 12345\n   or: npm run ts ./examples/remove-athlete.ts -- --name "First Last"',
  );
  process.exit(1);
}

function fullName(athlete: Athlete): string {
  return `${athlete.firstname} ${athlete.lastname}`;
}

async function removeAthlete() {
  const athletes = await Firestore.getRegisteredAthletes();

  let athlete: Athlete | undefined;
  if (id) {
    athlete = athletes.find((a) => a.id.toString() === id);
  } else {
    const matches = athletes.filter((a) => fullName(a).toLowerCase() === name!.toLowerCase());
    if (matches.length > 1) {
      console.error(`Multiple athletes named "${name}" - use --id instead:\n${matches.map((a) => `  ${a.id}: ${fullName(a)}`).join("\n")}`);
      process.exit(1);
    }
    athlete = matches[0];
  }

  if (!athlete) {
    console.error(`No registered athlete found for ${id ? `id "${id}"` : `name "${name}"`}.`);
    process.exit(1);
  }

  const config = await Firestore.getConfig();

  try {
    await Strava.revokeToken(config.stravaClientId, config.stravaClientSecret, athlete.refreshToken);
    console.log(`Revoked Strava access for ${athlete.id} (${fullName(athlete)}).`);
  } catch (error) {
    console.log(`Could not revoke Strava access for ${athlete.id} (${fullName(athlete)}) - likely already revoked: ${errorMessage(error)}`);
  }

  await Firestore.removeAthlete(athlete.id.toString(), config.challengeStartDate);
  console.log(`Removed athlete ${athlete.id} (${fullName(athlete)}).`);
}

removeAthlete();
