// Run with: npm run ts ./examples/reset-season.ts
// Requires:
// * A service-account.json file with a firestore service account in the project root directory
//
// Run once between seasons (never mid-season). Backs up, then revokes Strava access for and deletes every
// currently-registered athlete - the thing Strava's capacity review explicitly asks apps to do ("actively
// manage deauthorization ... maintain a lower connected athlete count"). Without this, every athlete who has
// ever registered stays counted as "connected" by Strava forever, since nothing else ever tells Strava a
// grant should end.
//
// Scoped to athletes, their current-season streaks, and their stored activities only - never touches fitcoin
// or results, which are kept as history (a season's totals and lucky draw only count the weeks inside its own
// challengeStartDate..challengeEndDate - see draw.ts's isChallengeAward).
//
// The backup is a local file (excluded/, gitignored), not Firestore: it leaves out refresh tokens and stored
// activities - the Strava data this exists to delete - so it only holds who was registered and their streaks.
// Delete it once the reset is confirmed.
//
// Order matters: revoke must happen before delete. Once an athlete's refresh token is deleted locally, there
// is no way to ever revoke it - silently leaving Strava still counting that athlete as "connected" forever,
// defeating the entire point of this script.

import { Firestore } from "../src/firestore";
import { Strava } from "../src/strava";
import { errorMessage } from "../src/errorReporting";
import { writeFileSync } from "fs";

async function resetSeason() {
  const config = await Firestore.getConfig();
  const athletes = await Firestore.getRegisteredAthletes();

  if (athletes.length === 0) {
    console.log("No registered athletes - nothing to do.");
    return;
  }

  const backupFile = `excluded/reset-season-backup-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
  console.log(`Backing up ${athletes.length} athletes (without tokens) and their streaks to ${backupFile}...`);
  const streaks = await Firestore.getStreaks(config.challengeStartDate);
  const athletesWithoutTokens = athletes.map(({ refreshToken: _refreshToken, ...athlete }) => athlete);
  writeFileSync(backupFile, JSON.stringify({ athletes: athletesWithoutTokens, streaks: Object.fromEntries(streaks) }, null, 2));

  console.log(`Revoking Strava access for and removing ${athletes.length} athletes...`);
  for (const athlete of athletes) {
    const label = `${athlete.id} (${athlete.firstname} ${athlete.lastname})`;
    try {
      await Strava.revokeToken(config.stravaClientId, config.stravaClientSecret, athlete.refreshToken);
      console.log(`  Revoked ${label}`);
    } catch (error) {
      // Expected for an athlete whose token was already dead/already deauthorized on Strava's side - continue
      // regardless, but only after this attempt, never before it (see the ordering note above).
      console.log(`  Could not revoke ${label} - likely already revoked: ${errorMessage(error)}`);
    }
    await Firestore.removeAthlete(athlete.id, config.challengeStartDate);
  }

  // Don't just trust the per-athlete loop silently: storeAthlete uses doc.create(), and POST /athlete checks
  // athleteIsRegistered *first* - a left-over athlete doc next season means that person is told "already
  // registered" with stale prior-season data, instead of a visible error.
  const remaining = await Firestore.getRegisteredAthletes();
  if (remaining.length > 0) {
    console.error(
      `Postcondition check failed: ${remaining.length} athlete(s) still registered after reset:\n` +
        remaining.map((athlete) => `  ${athlete.id}: ${athlete.firstname} ${athlete.lastname}`).join("\n"),
    );
    process.exit(1);
  }

  console.log("Reset complete - no athletes remain registered.");
}

resetSeason();
