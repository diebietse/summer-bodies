import * as functions from "firebase-functions";

export const weekDaily0900 = functions.pubsub
  .schedule("0 9 * * *")
  .timeZone("Africa/Johannesburg")
  .onRun(async (_context) => {
    // TODO: Publish daily updates
  });

export const monday0300 = functions.pubsub
  .schedule("0 3 * * 1")
  .timeZone("Africa/Johannesburg")
  .onRun(async (_context) => {
    // TODO: Run weekly maintenance
  });

export const monday0930 = functions.pubsub
  .schedule("30 9 * * 1")
  .timeZone("Africa/Johannesburg")
  .onRun(async (_context) => {
    // TODO: Publish weekly results
  });
