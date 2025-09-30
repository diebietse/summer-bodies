import { Firestore } from "./firestore";
import { Strava } from "./strava";
import { Slack } from "./slack";
import { Format } from "./format";
import { AthleteWithActivities, ChallengeResults } from "./challenge-models";
import { Challenge } from "./challenge";
import {
  currentWeekUnix,
  getPreviousWeek,
  previousWeekUnix,
  now,
  nextWeekUnix,
  nowPretty,
  lastWeekPretty,
} from "./util";
import crypto from "crypto";

export class Bot {
  static async publishDailyUpdates() {
    const config = await Firestore.getConfig();
    const newToken = await Strava.getToken(config.stravaClientId, config.stravaClientSecret, config.stravaRefreshToken);
    await Firestore.updateRefreshToken(newToken.refresh_token);
    const strava = new Strava(config.stravaClientId, config.stravaClientSecret);
    const slack = new Slack(config.slackWebhookUrl, config.slackChannelDaily);

    const currentWeek = currentWeekUnix();
    const timeNow = now();
    const nextWeek = nextWeekUnix();
    const allActivities = await this.getAllStravaAthletesActivities(strava, currentWeek, timeNow);
    const results = Challenge.calculateResults(allActivities);

    const id = crypto.randomUUID();

    // await this.publishInProgressTop(slack, results.topResults);
    // await this.publishInProgressGoalStatus(slack, results.goalResults);

    results.startDate = currentWeek;
    results.endDate = nextWeek;
    results.currentTime = timeNow;
    await Firestore.storeResults(id, JSON.stringify(results));

    await this.publishInProgress(slack, id);
  }

  static async publishWeeklyResults() {
    const config = await Firestore.getConfig();
    const strava = new Strava(config.stravaClientId, config.stravaClientSecret);
    const slack = new Slack(config.slackWebhookUrl, config.slackChannelWeekly);

    const previousWeek = previousWeekUnix();
    const currentWeek = currentWeekUnix();
    const timeNow = now();
    const allActivities = await this.getAllStravaAthletesActivities(strava, previousWeek, currentWeek);
    const results = Challenge.calculateResults(allActivities);

    // await this.publishFinalTop(slack, results.topResults);
    // await this.publishFinalGoalStatus(slack, results.goalResults);
    const id = crypto.randomUUID();

    results.startDate = previousWeek;
    results.endDate = currentWeek;
    results.currentTime = timeNow;
    await Firestore.storeResults(id, JSON.stringify(results));

    await this.publishFinal(slack, id);
    await this.publishWeeklyFitcoin(slack, results);
    await this.publishTotalFitcoin(slack);
  }

  private static async getAllStravaAthletesActivities(
    strava: Strava,
    startUnixTime: number,
    endUnixTime: number
  ): Promise<AthleteWithActivities[]> {
    const athletes = await Firestore.getRegisteredAthletes();
    const allActivities = await strava.getAllAthletesActivities(athletes, startUnixTime, endUnixTime);
    Firestore.updateAthletesRefreshToken(allActivities);
    return allActivities;
  }

  private static async publishInProgress(slack: Slack, id: string) {
    await slack.post(`In progress results on ${nowPretty()}: https://summer-bodies.web.app/results/${id}`);
  }

  // private static async publishInProgressTop(slack: Slack, topResults: ChallengeEvent[]) {
  //   topResults.forEach(async (event) => {
  //     const eventTableString = Format.inProgressEventTop(event);
  //     if (eventTableString) {
  //       await waitMilliseconds(1000);
  //       await slack.post(eventTableString);
  //     }
  //   });
  // }

  // private static async publishFinalTop(slack: Slack, topResults: ChallengeEvent[]) {
  //   topResults.forEach(async (event) => {
  //     const eventTableString = Format.finalEventTop(event);
  //     if (eventTableString) {
  //       await waitMilliseconds(1000);
  //       await slack.post(eventTableString);
  //     }
  //   });
  // }

  private static async publishFinal(slack: Slack, id: string) {
    await slack.post(`Final results for ${lastWeekPretty()}: https://summer-bodies.web.app/results/${id}`);
  }

  private static async publishWeeklyFitcoin(slack: Slack, results: ChallengeResults) {
    const contestantFitcoin = Challenge.calculateFitcoin(results);
    const lastWeek = getPreviousWeek();
    await Firestore.storeFitcoin(contestantFitcoin, lastWeek);
    await slack.post(Format.fitcoinStatus("Last Week's Fitcoin Results", contestantFitcoin));
  }

  private static async publishTotalFitcoin(slack: Slack) {
    const totalFitcoin = await Firestore.getFitcoinTotals();
    await slack.post(Format.fitcoinStatus("Total Fitcoin Results", totalFitcoin));
  }

  // private static async publishInProgressGoalStatus(slack: Slack, goalResult: GoalResult[]) {
  //   await slack.post(Format.goalStatus("In Progress Goal Status", goalResult));
  // }

  // private static async publishFinalGoalStatus(slack: Slack, goalResult: GoalResult[]) {
  //   await slack.post(Format.goalStatus("Last Week's Goal Results", goalResult));
  // }
}
