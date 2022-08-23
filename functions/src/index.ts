import * as functions from "firebase-functions";
import { Bot } from "./bot";
import express from "express";
import { Server } from "./server";

export const weekDaily0900 = functions.pubsub
  .schedule("0 9 * * *")
  .timeZone("Africa/Johannesburg")
  .onRun(async (_context) => {
    await Bot.publishDailyUpdates();
  });

export const monday0930 = functions.pubsub
  .schedule("30 9 * * 1")
  .timeZone("Africa/Johannesburg")
  .onRun(async (_context) => {
    await Bot.publishWeeklyResults();
  });

const server = new Server();
const expressServer = express();
expressServer.use("/", server.server());
export const httpServer = functions.https.onRequest(expressServer);
