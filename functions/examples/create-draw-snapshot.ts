// Run with: npm run ts ./examples/create-draw-snapshot.ts -- <draw time, e.g. 2026-11-06T12:00:00+02:00> [--dry-run]
// Requires:
// * Valid config loaded on firestore
// * A service-account.json file with a firestore service account in the project root directory
// * The challenge's final weekly results already run (they store its last week's FitCoin)
// Freezes the lucky draw entries (everyone's FitCoin total and ticket range), the prizes and the drand round
// published at the draw time into a snapshot, stores it (once - it can never be overwritten) and prints its
// SHA-256 fingerprint and its /draw link, whose random id is the only way to read it. Post the fingerprint, the draw
// time and the link in Slack before the draw - see README.md "Lucky Draw". --dry-run prints the snapshot without
// storing it.
import { createHash, randomUUID } from "crypto";
import moment from "moment";
import { Firestore } from "../src/firestore";
import { buildDrawSnapshot } from "../src/draw";
import { weekLabel } from "../src/util";

async function main() {
  const [drawTimeArg, ...flags] = process.argv.slice(2);
  const dryRun = flags.includes("--dry-run");
  const drawTime = moment(drawTimeArg, moment.ISO_8601, true);
  if (!drawTime.isValid() || !/(Z|[+-]\d\d:\d\d)$/.test(drawTimeArg)) {
    throw new Error(`Pass the draw time with its timezone, e.g. 2026-11-06T12:00:00+02:00 (got ${JSON.stringify(drawTimeArg)})`);
  }
  if (!drawTime.isAfter(moment())) throw new Error(`The draw time ${drawTime.format()} has already passed`);

  const config = await Firestore.getConfig();
  const finalWeek = weekLabel(moment.utc(`${config.challengeEndDate}T12:00:00+02:00`));
  if (!(await Firestore.hasWeeklyFitcoin(finalWeek))) {
    const problem = `No FitCoin stored yet for the final week (${finalWeek}) - wait for the final weekly results`;
    if (!dryRun) throw new Error(problem);
    console.warn(`Warning: ${problem}. Continuing as it's a dry run.\n`);
  }

  const snapshot = buildDrawSnapshot(
    await Firestore.getFitcoinTotals(),
    { startDate: config.challengeStartDate, endDate: config.challengeEndDate },
    drawTime.unix(),
    new Date(),
  );
  const text = JSON.stringify(snapshot, null, 2);
  const fingerprint = createHash("sha256").update(text, "utf8").digest("hex");

  console.log(text);
  console.log(`\n${snapshot.entries.length} entries, ${snapshot.totalTickets} tickets, ${snapshot.prizes.length} prizes`);
  console.log(
    `drand ${snapshot.drand.beacon} round ${snapshot.drand.round} at ${moment.utc(snapshot.drand.roundTime).utcOffset(120).format("YYYY-MM-DD HH:mm:ss")} SAST`,
  );
  console.log(`SHA-256 fingerprint: ${fingerprint}`);
  if (dryRun) {
    console.log("\nDry run - nothing stored.");
    return;
  }

  const id = randomUUID();
  await Firestore.createDrawSnapshot(config.challengeStartDate, id, text);
  console.log(`\nStored as draws/${config.challengeStartDate}. It can't be changed now - announce the fingerprint.`);
  console.log(`Draw link (only people with it can see the entries): https://summer-bodies.web.app/draw/${id}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
