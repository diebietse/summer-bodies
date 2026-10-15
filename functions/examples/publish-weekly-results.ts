// Run with: npm run ts ./examples/publish-weekly-results.ts -- [--live | <channel>]
// Requires:
// * Valid config loaded on firestore
// * A service-account.json file with a firestore service account in the project root directory
// Runs the real publishWeeklyResults job for last week (e.g. to recover from a failed Monday run). By default every
// Slack post, including error reports, goes to "#test-bot" (or the given channel); --live posts to the configured
// channels instead.
//
// Whatever the channel, this writes the real results: last week's FitCoin, streak FitCoin and updated streaks. Meant
// for after a failed run: already-evaluated streak days are skipped and each contestant's FitCoin doc is overwritten,
// but a contestant who earned FitCoin in an earlier successful run and no longer does keeps their old doc. "Last
// week" is relative to now - run it before next Monday, or it scores a different week.
import { Firestore } from "../src/firestore";
import { Bot } from "../src/bot";

const target = process.argv[2] ?? "#test-bot";
if (target !== "--live") {
  const getConfig = Firestore.getConfig.bind(Firestore);
  Firestore.getConfig = async () => ({ ...(await getConfig()), slackChannelWeekly: target, slackChannelErrors: target });
}

Bot.publishWeeklyResults().then(() =>
  console.log(`publishWeeklyResults finished, posted to ${target === "--live" ? "the configured channels" : target}`),
);
