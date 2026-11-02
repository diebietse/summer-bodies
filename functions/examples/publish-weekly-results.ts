// Run with: npm run ts ./examples/publish-weekly-results.ts -- [--live | <channel>] [--week <Monday, YYYY-MM-DD>]
// Requires:
// * Valid config loaded on firestore
// * A service-account.json file with a firestore service account in the project root directory
// Runs the real publishWeeklyResults job for last week (e.g. to recover from a failed Monday run), or with --week for
// the week starting on that Monday. By default every Slack post, including error reports, goes to "#test-bot" (or the
// given channel); --live posts to the configured channels instead.
//
// Whatever the channel, this writes the real results: the week's FitCoin, the updated streaks (and in the challenge's
// final week its streak FitCoin), and it makes the webhook-fed activity store match the week's poll - adding what's
// missing and deleting what Strava no longer has. Meant for after a failed run: already-evaluated streak days are
// skipped and each contestant's FitCoin doc is overwritten, but a contestant who earned FitCoin in an earlier
// successful run and no longer does keeps their old doc. Without --week, "last week" is relative to now. Streak days
// are evaluated in order, so re-run missed weeks oldest first - and as the streak award is only stored when the
// challenge's final week is scored, re-run a failed final week with --week even after the challenge has ended.
import { Firestore } from "../src/firestore";
import { Bot } from "../src/bot";
import { parseArgs } from "node:util";
import moment from "moment";
import { dateStringUnix } from "../src/util";

const { values, positionals } = parseArgs({ options: { live: { type: "boolean" }, week: { type: "string" } }, allowPositionals: true });
const target = values.live ? "--live" : (positionals[0] ?? "#test-bot");
let weekStart: number | undefined;
if (values.week) {
  weekStart = dateStringUnix(values.week);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(values.week) || moment.unix(weekStart).utcOffset(120).isoWeekday() !== 1) {
    throw new Error(`--week must be a Monday as YYYY-MM-DD (got ${values.week})`);
  }
}
if (target !== "--live") {
  const getConfig = Firestore.getConfig.bind(Firestore);
  Firestore.getConfig = async () => ({ ...(await getConfig()), slackChannelWeekly: target, slackChannelErrors: target });
}

Bot.publishWeeklyResults(weekStart).then(() =>
  console.log(`publishWeeklyResults finished, posted to ${target === "--live" ? "the configured channels" : target}`),
);
