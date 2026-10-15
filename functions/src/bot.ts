import { Firestore, SummerBodiesConfig } from "./firestore";
import { GetAllAthletesActivitiesResult, Strava } from "./strava";
import { ResultsImage, Slack } from "./slack";
import { Format } from "./format";
import { AthleteWithActivities, ChallengeResults, ContestantFitcoin, RegisteredAthlete, StreakState } from "./challenge-models";
import { Challenge, IgnoredDuplicate } from "./challenge";
import { Puppeteer } from "./puppeteer";
import { uploadPngToStorage } from "./firebase-storage";
import {
  currentWeekUnix,
  previousWeekLabel,
  previousWeekUnix,
  now,
  nextWeekUnix,
  nowPretty,
  lastWeekPretty,
  todayUnix,
  weekDateStrings,
} from "./util";
import { errorMessage, reportError, reportWarning } from "./errorReporting";
import crypto from "crypto";

export class Bot {
  // Runs a scheduled job, reporting any uncaught failure (Puppeteer, Firestore, a bad Strava response, ...)
  // instead of just failing the invocation silently - see errorReporting.ts.
  private static async runScheduledJob(name: string, job: () => Promise<void>): Promise<void> {
    try {
      await job();
    } catch (error) {
      await reportError(`${name} failed`, error);
    }
  }

  // The bot has its own Strava account (distinct from any athlete's), whose refresh token lives in
  // config.stravaRefreshToken and is refreshed here once per day. If it's invalid/expired, Strava's raw error
  // (e.g. `{"resource":"RefreshToken","field":"refresh_token","code":"invalid"}`) doesn't say *whose* token
  // that is - wrap it so the resulting Slack alert says exactly what's broken and how to fix it.
  private static async refreshBotToken(config: SummerBodiesConfig): Promise<void> {
    try {
      const newToken = await Strava.getToken(config.stravaClientId, config.stravaClientSecret, config.stravaRefreshToken);
      await Firestore.updateRefreshToken(newToken.refresh_token);
    } catch (error) {
      throw new Error(
        `The bot's own Strava account refresh token is invalid/expired - re-authorize it via examples/create-strava-token.ts, then save the new token to config.stravaRefreshToken. Underlying error: ${errorMessage(error)}`,
      );
    }
  }

  // Deliberately not posted to the athlete-facing daily/weekly channels - this is an operational problem for
  // whoever's running the bot to fix, not something athletes need to see or can do anything about.
  private static async reportFailedActivitiesFetch(
    caller: string,
    allActivities: GetAllAthletesActivitiesResult,
    config: SummerBodiesConfig,
  ): Promise<void> {
    await reportError(
      `${caller}: could not get all athletes' Strava activities`,
      new Error(`getAllAthletesActivities returned error: true (failed: ${allActivities.failedAthletes.join(", ")})`),
      config,
    );
  }

  static async publishDailyUpdates() {
    await this.runScheduledJob("publishDailyUpdates", async () => {
      const config = await Firestore.getConfig();
      await this.refreshBotToken(config);
      const strava = new Strava(config.stravaClientId, config.stravaClientSecret);
      const slack = new Slack(config.slackWebhookUrl, config.slackChannelDaily);

      const currentWeek = currentWeekUnix();
      const timeNow = now();
      const nextWeek = nextWeekUnix();
      const allActivities = await this.getAllStravaAthletesActivities(strava, currentWeek, timeNow);

      // Unlike the weekly results, a daily update is only a preview, so carry on without any athlete whose
      // fetch failed (e.g. a revoked token) and flag them in the errors channel instead - unless nobody
      // could be fetched, which points at Strava itself rather than at one athlete. Skipped athletes are also
      // missing from that day's streak preview and athlete list - accepted, since nothing here is persisted and
      // the weekly results (all-or-nothing) are what count.
      if (allActivities.error) {
        if (allActivities.athletesWithActivities.length === 0) {
          await this.reportFailedActivitiesFetch("publishDailyUpdates", allActivities, config);
          return;
        }
        await reportWarning(
          "publishDailyUpdates: skipped athletes whose Strava activities could not be fetched",
          allActivities.failedAthletes.join(", "),
          config,
        );
      }

      const results = Challenge.calculateResults(allActivities.athletesWithActivities);
      const id = crypto.randomUUID();

      results.startDate = currentWeek;
      results.endDate = nextWeek;
      results.currentTime = timeNow;
      results.streaks = await this.previewStreaks(config, allActivities.athletesWithActivities, currentWeek);
      results.athletes = this.mapRegisteredAthletes(allActivities.athletesWithActivities);
      await Firestore.storeResults(id, JSON.stringify(results));

      const resultsUrl = `https://summer-bodies.web.app/results/${id}`;
      const images = await this.screenshotResults(resultsUrl, `daily-update-${id}`);

      await this.publishInProgress(slack, resultsUrl, images);
    });
  }

  static async publishWeeklyResults() {
    await this.runScheduledJob("publishWeeklyResults", async () => {
      const config = await Firestore.getConfig();
      const strava = new Strava(config.stravaClientId, config.stravaClientSecret);
      const slack = new Slack(config.slackWebhookUrl, config.slackChannelWeekly);

      const previousWeek = previousWeekUnix();
      const currentWeek = currentWeekUnix();
      const timeNow = now();
      const allActivities = await this.getAllStravaAthletesActivities(strava, previousWeek, currentWeek);

      if (allActivities.error) {
        await this.reportFailedActivitiesFetch("publishWeeklyResults", allActivities, config);
        return;
      }

      if (allActivities.ignoredDuplicates.length > 0) {
        await reportWarning(
          "publishWeeklyResults: ignored overlapping (duplicate) activities, keeping the shortest",
          allActivities.ignoredDuplicates.map((d) => `${d.athlete}: ignored ${d.ignored}, overlaps ${d.kept}`).join("\n"),
          config,
        );
      }

      const results = Challenge.calculateResults(allActivities.athletesWithActivities);
      const id = crypto.randomUUID();

      results.startDate = previousWeek;
      results.endDate = currentWeek;
      results.currentTime = timeNow;
      results.streaks = await this.finalizeStreaks(config, allActivities.athletesWithActivities, previousWeek, currentWeek);
      results.athletes = this.mapRegisteredAthletes(allActivities.athletesWithActivities);
      await Firestore.storeResults(id, JSON.stringify(results));

      const resultsUrl = `https://summer-bodies.web.app/results/${id}`;
      const images = await this.screenshotResults(resultsUrl, `weekly-results-${id}`);

      await this.publishFinal(slack, resultsUrl, images);
      await this.publishWeeklyFitcoin(slack, results);
      await this.publishTotalFitcoin(slack);
    });
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

    // Only newly counted days earn FitCoin, so re-running the job for the same week awards nothing again (and
    // must not overwrite the already-stored award with zeros).
    const streakFitcoin: ContestantFitcoin[] = updatedStreaks
      .filter((streak) => streak.alive)
      .map((streak) => ({
        name: streak.name,
        fitcoin: streak.currentStreak - (previousStreaks.get(streak.athleteId)?.currentStreak ?? 0),
      }))
      .filter((contestant) => contestant.fitcoin > 0);

    // FitCoin first, streaks second: once the streaks are saved a re-run awards nothing for these days, so saving
    // them before a failed FitCoin write would lose that award for good. The other way round, a re-run just
    // recomputes the same award and overwrites it.
    if (streakFitcoin.length > 0) await Firestore.storeStreakFitcoin(streakFitcoin, previousWeekLabel());
    await Firestore.saveStreaks(config.challengeStartDate, updatedStreaks);

    return updatedStreaks;
  }

  // Derived from the athletes already fetched for the results above - no extra Firestore round-trip.
  private static mapRegisteredAthletes(athletes: AthleteWithActivities[]): RegisteredAthlete[] {
    return athletes.map((athlete) => ({ name: `${athlete.firstname} ${athlete.lastname}` })).sort((a, b) => a.name.localeCompare(b.name));
  }

  private static async getAllStravaAthletesActivities(
    strava: Strava,
    startUnixTime: number,
    endUnixTime: number,
  ): Promise<GetAllAthletesActivitiesResult & { ignoredDuplicates: IgnoredDuplicate[] }> {
    const athletes = await Firestore.getRegisteredAthletes();
    const results = await strava.getAllAthletesActivities(athletes, startUnixTime, endUnixTime);
    // Strava rotates the refresh token on every use, so persist the new one for everyone who was fetched
    // successfully - even when others failed and the caller discards the result.
    await Firestore.updateAthletesRefreshToken(results.athletesWithActivities);
    const { athletes: deduplicated, ignored } = Challenge.removeDuplicateActivities(results.athletesWithActivities);
    return { ...results, athletesWithActivities: deduplicated, ignoredDuplicates: ignored };
  }

  // Screenshots each section of the results page separately (challenges, goals, streak) and uploads them to
  // Firebase Storage, so Slack shows several readable images instead of one tall, scaled-down page.
  private static async screenshotResults(resultsUrl: string, fileNamePrefix: string): Promise<ResultsImage[]> {
    const sections = await Puppeteer.screenshotSections(`${resultsUrl}?screenshot=true`);
    return Promise.all(
      sections.map(async ({ name, title, png }) => {
        const url = await uploadPngToStorage(png, `${fileNamePrefix}-${name}`);
        console.log(`Screenshot '${name}' uploaded to: ${url}`);
        return { title, url };
      }),
    );
  }

  private static async publishInProgress(slack: Slack, resultsUrl: string, images: ResultsImage[]) {
    await slack.postResults(`New in progress results for ${nowPretty()}!\nSee the screenshots below`, images, resultsUrl);
  }

  private static async publishFinal(slack: Slack, resultsUrl: string, images: ResultsImage[]) {
    await slack.postResults(`The final results for ${lastWeekPretty()} are out!\nSee the screenshots below`, images, resultsUrl);
  }

  private static async publishWeeklyFitcoin(slack: Slack, results: ChallengeResults) {
    const contestantFitcoin = Challenge.calculateFitcoin(results);
    const lastWeek = previousWeekLabel();
    await Firestore.storeFitcoin(contestantFitcoin, lastWeek);
    // The streak award is stored separately (see finalizeStreaks) so it isn't double-counted in the totals,
    // but it belongs in this week's breakdown so that it adds up to the total below.
    const streakFitcoin = await Firestore.getStreakFitcoin(lastWeek);
    await slack.post(Format.fitcoinStatus("Last Week's Fitcoin Results", Challenge.combineFitcoin(contestantFitcoin, streakFitcoin)));
  }

  private static async publishTotalFitcoin(slack: Slack) {
    const totalFitcoin = await Firestore.getFitcoinTotals();
    await slack.post(Format.fitcoinStatus("Total Fitcoin Results", totalFitcoin));
  }
}
