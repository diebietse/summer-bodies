import { Firestore } from "./firestore";
import { Strava } from "./strava";
import { Slack } from "./slack";
import { Format } from "./format";
import { AthleteWithActivities, ChallengeResults } from "./challenge-models";
import { Challenge } from "./challenge";
import { Puppeteer } from "./puppeteer";
import { uploadPngToStorage } from "./firebase-storage";
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

    results.startDate = currentWeek;
    results.endDate = nextWeek;
    results.currentTime = timeNow;
    await Firestore.storeResults(id, JSON.stringify(results));

    const resultsUrl = `https://summer-bodies.web.app/results/${id}`;
    const screenshot = await Puppeteer.screenshot(resultsUrl);

    // Upload screenshot to Firebase Storage
    const screenshotFileName = `daily-update-${id}`;
    const screenshotUrl = await uploadPngToStorage(screenshot, screenshotFileName);
    console.log(`Screenshot uploaded to: ${screenshotUrl}`);

    await this.publishInProgress(slack, resultsUrl, screenshotUrl);
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

    const id = crypto.randomUUID();

    results.startDate = previousWeek;
    results.endDate = currentWeek;
    results.currentTime = timeNow;
    await Firestore.storeResults(id, JSON.stringify(results));

    const resultsUrl = `https://summer-bodies.web.app/results/${id}`;
    const screenshot = await Puppeteer.screenshot(resultsUrl);

    // Upload screenshot to Firebase Storage
    const screenshotFileName = `weekly-results-${id}`;
    const screenshotUrl = await uploadPngToStorage(screenshot, screenshotFileName);
    console.log(`Screenshot uploaded to: ${screenshotUrl}`);

    await this.publishFinal(slack, resultsUrl, screenshotUrl);
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

  private static async publishInProgress(slack: Slack, resultsUrl: string, screenshotUrl: string) {
    await slack.postResults(
      `New in progress results for ${nowPretty()}!\nSee the screenshot below`,
      screenshotUrl,
      resultsUrl
    );
  }

  private static async publishFinal(slack: Slack, resultsUrl: string, screenshotUrl: string) {
    await slack.postResults(
      `The final results for ${lastWeekPretty()} are out!\nSee the screenshot below`,
      screenshotUrl,
      resultsUrl
    );
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
}
