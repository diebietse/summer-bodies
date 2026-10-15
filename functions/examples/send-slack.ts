// Run with: npm run ts ./examples/send-slack.ts
// Requires:
// * Valid config loaded on firestore (for the Slack webhook URL)
// * A service-account.json file with a firestore service account in the project root directory
// Posts a message with hardcoded example image/results URLs to the "#test-bot" Slack channel

import axios from "axios";
import { Firestore } from "../src/firestore";
import { Slack } from "../src/slack";
import { nowPretty } from "../src/util";

// A real uploaded results screenshot - Slack downloads every image_url and rejects the whole message
// ("invalid_blocks") if any of them can't be fetched, so this has to stay a live file.
const EXAMPLE_IMAGE_URL =
  "https://firebasestorage.googleapis.com/v0/b/summer-bodies.appspot.com/o/results%2Fdaily-update-e699fc5b-f578-446e-85c1-6104ffec23f7.png?alt=media&token=611d67e3-d3d9-4faf-977f-5f562f4cb665";

async function main() {
  const config = await Firestore.getConfig();
  const slack = new Slack(config.slackWebhookUrl, "#test-bot");
  try {
    await slack.postResults(
      `Screenshot of in progress results on ${nowPretty()}`,
      ["Streak Challenge", "Goal Achievements", "Challenge Results"].map((title) => ({ title, url: EXAMPLE_IMAGE_URL })),
      "https://summer-bodies.web.app/results/e699fc5b-f578-446e-85c1-6104ffec23f7",
    );
  } catch (e) {
    // Slack's reason (e.g. "invalid_blocks") is in the response body - the full AxiosError dump buries it.
    console.log(axios.isAxiosError(e) ? `Slack rejected the message: ${e.response?.status} ${e.response?.data}` : e);
  }
}

main();
