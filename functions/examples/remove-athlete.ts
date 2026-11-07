// Run with: npm run ts ./examples/remove-athlete.ts -- --id 12345
//       or: npm run ts ./examples/remove-athlete.ts -- --name "First Last"
//       (add --force to remove them even if revoking their Strava access fails)
// Requires:
// * A service-account.json file with a firestore service account in the project root directory
//
// Revokes the athlete's authorization on Strava's side, then deletes their registration (name + stored
// refresh token), stored activities, and current-challenge streak doc. Use this to honor a deauthorization/
// data-deletion request, per the Strava API Agreement's termination clause (https://www.strava.com/legal/api)
// - deleting only our own copy of their data (without revoking) would leave Strava still counting this
// athlete as "connected" indefinitely, since nothing ever told Strava the grant should end.
//
// If the revoke fails (Strava answers 200 even for a dead token, so it's a real failure), the athlete is left
// registered - try again later, or pass --force to remove them anyway.
//
// It's also the fix if weekly results generation has stopped for everyone: a revoked or otherwise invalid
// refresh token fails that athlete's Strava fetch, and the weekly results are all-or-nothing - see
// functions/src/bot.ts. (During the challenge the daily update reports rejected tokens of athletes with recent
// activities, so it may show sooner.) A dead token still revokes fine.

import { parseArgs } from "node:util";
import { Firestore } from "../src/firestore";
import { Strava } from "../src/strava";
import { Athlete } from "../src/challenge-models";
import { errorMessage } from "../src/errorReporting";
import { revokeThenRemove } from "../src/athleteRemoval";

const {
  values: { id, name, force },
} = parseArgs({
  options: {
    id: { type: "string" },
    name: { type: "string" },
    force: { type: "boolean" },
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

  const label = `${athlete.id} (${fullName(athlete)})`;
  const { removed, revokeError } = await revokeThenRemove(
    athlete,
    {
      revoke: (refreshToken) => Strava.revokeToken(config.stravaClientId, config.stravaClientSecret, refreshToken),
      remove: (athleteId) => Firestore.removeAthlete(athleteId, config.challengeStartDate),
    },
    force,
  );
  if (revokeError) console.error(`Could not revoke Strava access for ${label}: ${errorMessage(revokeError)}`);
  else console.log(`Revoked Strava access for ${label}.`);
  if (!removed) {
    console.error("Not removed - try again later, or pass --force to remove them anyway (their grant then stays on Strava).");
    process.exit(1);
  }
  console.log(`Removed athlete ${label}.`);
}

removeAthlete();
