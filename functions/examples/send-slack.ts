// Run with: npm run ts ./examples/send-slack.ts
// Requires:
// * Valid config loaded on firestore (for the Slack webhook URL)
// * A service-account.json file with a firestore service account in the project root directory
// Posts a message with hardcoded example image/results URLs to the "#test-bot" Slack channel

import { Firestore } from "../src/firestore";
import { Slack } from "../src/slack";
import { nowPretty } from "../src/util";

async function main() {
  const config = await Firestore.getConfig();
  const slack = new Slack(config.slackWebhookUrl, "#test-bot");
  try {
    await slack.postResults(
      `Screenshot of in progress results on ${nowPretty()}`,
      "https://firebasestorage.googleapis.com/v0/b/summer-bodies.appspot.com/o/example.png?alt=media&token=90a98a5b-4917-4614-a828-8eb2ccf23e7c",
      "https://summer-bodies.web.app/results/d07d3718-ffb4-4983-bef6-bb04e3a8e029",
    );
  } catch (e) {
    console.log(e);
  }
}

main();
