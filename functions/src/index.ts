import * as functions from "firebase-functions";

import { onSchedule } from "firebase-functions/v2/scheduler";

import { Bot } from "./bot";
import express from "express";
import { Server } from "./server";

// Set memory limit based on: https://firebase.google.com/docs/functions/manage-functions#set-timeout
export const weekDaily0900 = onSchedule(
  {
    schedule: "0 9 * * *",
    timeZone: "Africa/Johannesburg",
    memory: "1GiB",
  },
  async () => {
    await Bot.publishDailyUpdates();
  }
);

export const monday0930 = onSchedule(
  {
    schedule: "30 9 * * 1",
    timeZone: "Africa/Johannesburg",
    memory: "1GiB",
  },
  async () => {
    await Bot.publishWeeklyResults();
  }
);

const server = new Server();
const expressServer = express();
expressServer.use("/", server.server());
export const httpServer = functions.https.onRequest(expressServer);
