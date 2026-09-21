import { Firestore, SummerBodiesConfig } from "./firestore";
import { GetAllAthletesActivitiesResult, Strava } from "./strava";
import { Slack } from "./slack";
import { Format } from "./format";
import { AthleteWithActivities, ChallengeResults, ContestantFitcoin, StreakState } from "./challenge-models";
import { Challenge } from "./challenge";
import { Puppeteer } from "./puppeteer";
import { uploadPngToStorage } from "./firebase-storage";
import { currentWeekUnix, getPreviousWeek, previousWeekUnix, now, nextWeekUnix, nowPretty, lastWeekPretty, todayUnix, weekDateStrings } from "./util";
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

    if (allActivities.error) {
      await slack.post(`Error: Could not get all athletes' activities, will try again later`);
      return;
    }

    const results = Challenge.calculateResults(allActivities.athletesWithActivities);
    const id = crypto.randomUUID();

    results.startDate = currentWeek;
    results.endDate = nextWeek;
    results.currentTime = timeNow;
    results.streaks = await this.previewStreaks(config, allActivities.athletesWithActivities, currentWeek);
    await Firestore.storeResults(id, JSON.stringify(results));

    const resultsUrl = `https://summer-bodies.web.app/results/${id}`;
    const screenshot = await Puppeteer.screenshot(`${resultsUrl}?screenshot=true`);

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

    if (allActivities.error) {
      await slack.post(`Error: Could not get all athletes' activities, will try again later`);
      return;
    }

    const results = Challenge.calculateResults(allActivities.athletesWithActivities);
    const id = crypto.randomUUID();

    results.startDate = previousWeek;
    results.endDate = currentWeek;
    results.currentTime = timeNow;
    results.streaks = await this.finalizeStreaks(config, allActivities.athletesWithActivities, previousWeek, currentWeek);
    await Firestore.storeResults(id, JSON.stringify(results));

    const resultsUrl = `https://summer-bodies.web.app/results/${id}`;
    const screenshot = await Puppeteer.screenshot(`${resultsUrl}?screenshot=true`);

    // Upload screenshot to Firebase Storage
    const screenshotFileName = `weekly-results-${id}`;
    const screenshotUrl = await uploadPngToStorage(screenshot, screenshotFileName);
    console.log(`Screenshot uploaded to: ${screenshotUrl}`);

    await this.publishFinal(slack, resultsUrl, screenshotUrl);
    await this.publishWeeklyFitcoin(slack, results);
    await this.publishTotalFitcoin(slack);
  }

  // Shared by previewStreaks/finalizeStreaks below: clamps `dates` to the challenge window, loads the persisted
  // baseline, and advances it. Returns null when none of `dates` falls within the challenge window.
  private static async computeStreakUpdates(
    config: SummerBodiesConfig,
    athletes: AthleteWithActivities[],
    dates: string[],
  ): Promise<{ previousStreaks: Map<string, StreakState>; updatedStreaks: StreakState[] } | null> {
    const challengeDates = dates.filter((date) => date >= config.challengeStartDate && date <= config.challengeEndDate);
    if (challengeDates.length === 0) return null;

    const previousStreaks = await Firestore.getStreaks(config.challengeStartDate);
    const updatedStreaks = Challenge.calculateStreakUpdates(athletes, previousStreaks, challengeDates);
    return { previousStreaks, updatedStreaks };
  }

  // Non-authoritative preview of the streak challenge for the in-progress results page, using activities already
  // fetched for it above - no extra Strava call. Only previews up to yesterday, since today's upload window is
  // still open. Nothing is persisted here - see finalizeStreaks for the once-a-week authoritative version.
  private static async previewStreaks(config: SummerBodiesConfig, athletes: AthleteWithActivities[], weekStartUnix: number): Promise<StreakState[]> {
    const result = await this.computeStreakUpdates(config, athletes, weekDateStrings(weekStartUnix, todayUnix()));
    return result?.updatedStreaks ?? [];
  }

  // Only called once a week, once every day in that week has had its full Sunday-23:59 upload window close - see
  // Challenge.calculateStreakUpdates for why elimination can't be decided any earlier than that. Persists the
  // updated streaks and awards that week's streak FitCoin (1 per day survived that week), which then rolls into
  // the raffle total the same way as every other FitCoin source (Firestore.getFitcoinTotals sums every doc in
  // the fitcoin collection).
  //
  // Known limitation: if getAllStravaAthletesActivities fails for this week, publishWeeklyResults returns before
  // this ever runs, and - since only the current week's dates are ever evaluated - that week's streak days are
  // never retried later. This mirrors how a failed week already skips the leaderboard/goal scoring entirely
  // elsewhere in this file; there's no backfill mechanism for any of it.
  private static async finalizeStreaks(
    config: SummerBodiesConfig,
    athletes: AthleteWithActivities[],
    weekStartUnix: number,
    weekEndUnix: number,
  ): Promise<StreakState[]> {
    const result = await this.computeStreakUpdates(config, athletes, weekDateStrings(weekStartUnix, weekEndUnix));
    if (!result) return [];
    const { previousStreaks, updatedStreaks } = result;

    const streakFitcoin: ContestantFitcoin[] = updatedStreaks
      .filter((streak) => streak.alive)
      .map((streak) => ({
        name: streak.name,
        fitcoin: streak.currentStreak - (previousStreaks.get(streak.athleteId)?.currentStreak ?? 0),
      }));

    await Promise.all([
      Firestore.saveStreaks(config.challengeStartDate, updatedStreaks),
      streakFitcoin.length > 0 ? Firestore.storeStreakFitcoin(streakFitcoin, getPreviousWeek().toDateString()) : Promise.resolve(),
    ]);

    return updatedStreaks;
  }

  private static async getAllStravaAthletesActivities(
    strava: Strava,
    startUnixTime: number,
    endUnixTime: number,
  ): Promise<GetAllAthletesActivitiesResult> {
    const athletes = await Firestore.getRegisteredAthletes();
    const results = await strava.getAllAthletesActivities(athletes, startUnixTime, endUnixTime);
    if (!results.error) await Firestore.updateAthletesRefreshToken(results.athletesWithActivities);
    return results;
  }

  private static async publishInProgress(slack: Slack, resultsUrl: string, screenshotUrl: string) {
    await slack.postResults(`New in progress results for ${nowPretty()}!\nSee the screenshot below`, screenshotUrl, resultsUrl);
  }

  private static async publishFinal(slack: Slack, resultsUrl: string, screenshotUrl: string) {
    await slack.postResults(`The final results for ${lastWeekPretty()} are out!\nSee the screenshot below`, screenshotUrl, resultsUrl);
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
