// Run with: npm run ts ./examples/manage-strava-webhook.ts -- --create --url https://us-central1-<project>.cloudfunctions.net/httpServer/strava-webhook
//       or: npm run ts ./examples/manage-strava-webhook.ts -- --view
//       or: npm run ts ./examples/manage-strava-webhook.ts -- --delete --id 12345
// Requires:
// * A service-account.json file with a firestore service account in the project root directory
// * For --create: the webhook endpoint (GET/POST /strava-webhook in api.ts) already deployed and reachable -
//   Strava validates it synchronously, as part of the create call below, before the subscription exists.
//
// Strava allows exactly one push subscription per application, covering every authorized athlete - see
// https://developers.strava.com/docs/webhooks/. Delete the existing one before creating a replacement (e.g.
// after changing the callback URL).

import { parseArgs } from "node:util";
import crypto from "crypto";
import { Firestore } from "../src/firestore";
import { Strava } from "../src/strava";

const {
  values: { create, view, delete: deleteFlag, url, id },
} = parseArgs({
  options: {
    create: { type: "boolean" },
    view: { type: "boolean" },
    delete: { type: "boolean" },
    url: { type: "string" },
    id: { type: "string" },
  },
});

function usage(): never {
  console.error(
    "Usage: npm run ts ./examples/manage-strava-webhook.ts -- --create --url <callback-url>\n" +
      "   or: npm run ts ./examples/manage-strava-webhook.ts -- --view\n" +
      "   or: npm run ts ./examples/manage-strava-webhook.ts -- --delete --id <subscription-id>",
  );
  process.exit(1);
}

async function main() {
  const config = await Firestore.getConfig();

  if (create) {
    if (!url) usage();
    const verifyToken = crypto.randomBytes(24).toString("hex");
    // Saved before creating the subscription: Strava's validation handshake (a GET to `url`) happens
    // synchronously as part of the create call below, and our GET /strava-webhook checks the token it
    // receives against whatever's currently in config.
    await Firestore.uploadConfig({ ...config, stravaWebhookVerifyToken: verifyToken });
    const subscription = await Strava.createPushSubscription(config.stravaClientId, config.stravaClientSecret, url!, verifyToken);
    console.log(`Created subscription ${subscription.id}.`);
    return;
  }

  if (view) {
    const subscriptions = await Strava.viewPushSubscriptions(config.stravaClientId, config.stravaClientSecret);
    console.log(subscriptions.length === 0 ? "No active subscription." : JSON.stringify(subscriptions, null, 2));
    return;
  }

  if (deleteFlag) {
    if (!id) usage();
    await Strava.deletePushSubscription(config.stravaClientId, config.stravaClientSecret, Number(id));
    console.log(`Deleted subscription ${id}.`);
    return;
  }

  usage();
}

main();
