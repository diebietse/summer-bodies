// Run with: npm run ts ./examples/send-slack.ts

import { Firestore } from "../src/firestore";
import { Slack } from "../src/slack";

async function main() {
  const config = await Firestore.getConfig();
  const slack = new Slack(config.slackWebhookUrl, config.slackChannelDaily);
  await slack.post("test");
}

main();
