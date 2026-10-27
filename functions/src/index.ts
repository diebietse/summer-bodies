import * as functions from "firebase-functions";

import { onSchedule } from "firebase-functions/v2/scheduler";

import { Bot } from "./bot";
import express from "express";
import { Server } from "./server";

// Set memory limit based on: https://firebase.google.com/docs/functions/manage-functions#set-timeout
// Both scheduled jobs run headless Chrome for the results screenshots; at 1GiB (about 0.6 of a CPU) Chrome sometimes
// took over 30 s to start or to load the page. 2GiB also comes with a full CPU.
export const weekDaily0900 = onSchedule(
  {
    schedule: "0 9 * * *",
    timeZone: "Africa/Johannesburg",
    memory: "2GiB",
  },
  async () => {
    await Bot.publishDailyUpdates();
  },
);

export const monday0930 = onSchedule(
  {
    schedule: "30 9 * * 1",
    timeZone: "Africa/Johannesburg",
    memory: "2GiB",
  },
  async () => {
    await Bot.publishWeeklyResults();
  },
);

const server = new Server();
const expressServer = express();
expressServer.use("/", server.server());
export const httpServer = functions.https.onRequest(expressServer);
