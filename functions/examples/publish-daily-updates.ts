// Run with: npm run ts ./examples/publish-daily-updates.ts -- [--live | <channel>]
// Requires:
// * Valid config loaded on firestore
// * A service-account.json file with a firestore service account in the project root directory
// Runs the real publishDailyUpdates job (e.g. to recover from a failed scheduled run). By default every Slack post,
// including error/warning reports, goes to "#test-bot" (or the given channel); --live posts to the configured
// channels instead. Like the scheduled job it stores a results doc and rotates Strava refresh tokens, but persists
// no streaks, so it's safe to run any number of times.
import { Firestore } from "../src/firestore";
import { Bot } from "../src/bot";

const target = process.argv[2] ?? "#test-bot";
if (target !== "--live") {
  const getConfig = Firestore.getConfig.bind(Firestore);
  Firestore.getConfig = async () => ({ ...(await getConfig()), slackChannelDaily: target, slackChannelErrors: target });
}

Bot.publishDailyUpdates().then(() =>
  console.log(`publishDailyUpdates finished, posted to ${target === "--live" ? "the configured channels" : target}`),
);
