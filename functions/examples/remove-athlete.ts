// Run with: npm run ts ./examples/remove-athlete.ts -- --id 12345
//       or: npm run ts ./examples/remove-athlete.ts -- --name "First Last"
// Requires:
// * A service-account.json file with a firestore service account in the project root directory
//
// Deletes an athlete's registration (profile + stored refresh token) and their current-challenge streak doc.
// Use this to honor a deauthorization/data-deletion request, per the Strava API Agreement's termination clause
// (https://www.strava.com/legal/api) - revoking access on Strava's side does not, by itself, delete anything
// this app stored.
//
// It's also the fix if daily/weekly results generation has stopped for everyone: a revoked or otherwise
// invalid refresh token fails that athlete's Strava fetch, and getAllAthletesActivities treats any single
// athlete's failure as a whole-batch failure - see functions/src/bot.ts.

import { parseArgs } from "node:util";
import { Firestore } from "../src/firestore";
import { Athlete } from "../src/challenge-models";

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
  await Firestore.removeAthlete(athlete.id.toString(), config.challengeStartDate);
  console.log(`Removed athlete ${athlete.id} (${fullName(athlete)}).`);
}

removeAthlete();
