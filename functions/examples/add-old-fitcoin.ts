// Run with: npm run ts ./examples/add-old-fitcoin.ts

import { Firestore } from "../src/firestore";
import { Strava } from "../src/strava";
import { Challenge } from "../src/challenge";
import moment from "moment";

async function addFitcoin(strava: Strava, startUnixTime: number, endUnixTime: number) {
  const athletes = await Firestore.getRegisteredAthletes();
  const athletesWithActivities = await strava.getAllAthletesActivities(athletes, startUnixTime, endUnixTime);

  const contestantFitcoin = await Challenge.calculateFitcoin(athletesWithActivities);

  await Firestore.storeFitcoin(contestantFitcoin, moment.unix(startUnixTime).toDate());
}

async function addOldFitcoin() {
  const config = await Firestore.getConfig();
  const strava = new Strava(config.stravaClientId, config.stravaClientSecret);

  for (let i = 12; i >= 1; i--) {
    const startUnixTime = moment.utc().subtract(i, "week").startOf("isoWeek").unix();
    const endUnixTime = moment
      .utc()
      .subtract(i - 1, "week")
      .startOf("isoWeek")
      .unix();
    console.log(`Adding ${moment.unix(startUnixTime).toDate()} - ${moment.unix(endUnixTime).toDate()}`);
    await addFitcoin(strava, startUnixTime, endUnixTime);
  }
}

addOldFitcoin();
