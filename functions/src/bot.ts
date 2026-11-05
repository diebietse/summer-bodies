import { Firestore, SummerBodiesConfig } from "./firestore";
import { GetAllAthletesActivitiesResult, Strava } from "./strava";
import { ResultsImage, Slack } from "./slack";
import { AthleteWithActivities, ContestantFitcoin, RegisteredAthlete, StreakState } from "./challenge-models";
import { Challenge, IgnoredDuplicate } from "./challenge";
import { Puppeteer } from "./puppeteer";
import { uploadPngToStorage } from "./firebase-storage";
import { currentWeekUnix, datePretty, previousWeekUnix, now, nextWeekUnix, nowPretty, todayUnix, weekDateStrings, weekLabel } from "./util";
import { reportError, reportWarning } from "./errorReporting";
import {
  checkWebhookLiveness,
  getAthletesActivitiesFromStore,
  recheckRecentActivities,
  sweepStuckWebhookEvents,
  syncActivitiesIntoStore,
} from "./activityStore";
import crypto from "crypto";
import moment from "moment";
import { isChallengeAward } from "./draw";

export class Bot {
  // Runs a scheduled job, reporting any uncaught failure (Puppeteer, Firestore, a bad Strava response, ...)
  // instead of just failing the invocation silently - see errorReporting.ts.
  private static async runScheduledJob(name: string, job: () => Promise<void>): Promise<void> {
    const started = Date.now();
    try {
      await job();
      console.log(`${name} finished in ${((Date.now() - started) / 1000).toFixed(1)} s`);
    } catch (error) {
      console.log(`${name} failed after ${((Date.now() - started) / 1000).toFixed(1)} s`);
      await reportError(`${name} failed`, error);
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

  // Reads from the webhook-fed activity store (see activityStore.ts) instead of polling every athlete's week of
  // Strava activities live - that daily live poll is exactly what Strava's capacity review flagged. During the
  // challenge it first rechecks the last two days for athletes with an activity stored in them (one list call each -
  // see activityStore.recheckRecentActivities). The weekly job (below) still polls live, once a week, and makes the
  // store match that poll (see reconcileActivityStore).
  static async publishDailyUpdates() {
    await this.runScheduledJob("publishDailyUpdates", async () => {
      const config = await Firestore.getConfig();
      await checkWebhookLiveness(config);
      await sweepStuckWebhookEvents(config);
      await recheckRecentActivities(config);
      const slack = new Slack(config.slackWebhookUrl, config.slackChannelDaily);

      const currentWeek = currentWeekUnix();
      const timeNow = now();
      const nextWeek = nextWeekUnix();
      // Same duplicate handling as the weekly results (see getAllStravaAthletesActivities), silently - the weekly
      // results report any ignored duplicates.
      const { athletes: athletesWithActivities } = Challenge.removeDuplicateActivities(await getAthletesActivitiesFromStore(currentWeek, timeNow));

      const results = Challenge.calculateResults(athletesWithActivities);
      const id = crypto.randomUUID();

      results.startDate = currentWeek;
      results.endDate = nextWeek;
      results.currentTime = timeNow;
      results.streaks = await this.previewStreaks(config, athletesWithActivities, currentWeek);
      results.athletes = this.mapRegisteredAthletes(athletesWithActivities);
      results.fitcoin = await this.fitcoinSoFar(config, Challenge.calculateFitcoin(results), currentWeek);
      await Firestore.storeResults(id, JSON.stringify(results));

      const resultsUrl = `https://summer-bodies.web.app/results/${id}`;
      const images = await this.screenshotResults(resultsUrl, `daily-update-${id}`);

      await this.publishInProgress(slack, resultsUrl, images);
    });
  }

  // Scores last week by default - the Monday job. `weekStartUnix` (a Monday 00:00 SAST) scores another week instead,
  // e.g. a final week whose run failed and wasn't re-run before the next Monday (see
  // examples/publish-weekly-results.ts): the streak award is only stored when the challenge's final week is scored.
  static async publishWeeklyResults(weekStartUnix: number = previousWeekUnix()) {
    await this.runScheduledJob("publishWeeklyResults", async () => {
      const config = await Firestore.getConfig();
      const strava = new Strava(config.stravaClientId, config.stravaClientSecret);
      const slack = new Slack(config.slackWebhookUrl, config.slackChannelWeekly);

      const previousWeek = weekStartUnix;
      const currentWeek = moment.unix(weekStartUnix).add(1, "week").unix();
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

      await this.reconcileActivityStore(allActivities.polledAthletes, previousWeek, currentWeek, config);

      const results = Challenge.calculateResults(allActivities.athletesWithActivities);
      const id = crypto.randomUUID();

      results.startDate = previousWeek;
      results.endDate = currentWeek;
      results.currentTime = timeNow;
      const { streaks, streakFitcoin } = await this.finalizeStreaks(config, allActivities.athletesWithActivities, previousWeek, currentWeek);
      results.streaks = streaks;
      results.athletes = this.mapRegisteredAthletes(allActivities.athletesWithActivities);
      // Stored before the totals are read, so they include last week - and the streak award, in the final week.
      const weekFitcoin = Challenge.calculateFitcoin(results);
      await Firestore.storeFitcoin(weekFitcoin, weekLabel(moment.unix(previousWeek)));
      results.fitcoin = { week: weekFitcoin, total: await this.challengeFitcoinTotals(config) };
      if (streakFitcoin.length > 0) results.fitcoin.streak = streakFitcoin;
      await Firestore.storeResults(id, JSON.stringify(results));

      const resultsUrl = `https://summer-bodies.web.app/results/${id}`;
      const images = await this.screenshotResults(resultsUrl, `weekly-results-${id}`);

      await this.publishFinal(slack, resultsUrl, images, previousWeek, currentWeek);
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

  // Non-authoritative preview of the streak challenge for the in-progress results page, using the activities the
  // daily update already read from the store. Only previews up to yesterday, since today's upload window is
  // still open. Nothing is persisted here - see finalizeStreaks for the once-a-week authoritative version.
  private static async previewStreaks(config: SummerBodiesConfig, athletes: AthleteWithActivities[], weekStartUnix: number): Promise<StreakState[]> {
    const result = await this.computeStreakUpdates(config, athletes, weekDateStrings(weekStartUnix, todayUnix()));
    return result?.updatedStreaks ?? [];
  }

  // Only called once a week, once every day in that week has had its full Sunday-23:59 upload window close - see
  // Challenge.calculateStreakUpdates for why a missed day can't be decided any earlier than that. Persists the
  // updated streaks and, in the challenge's final week, stores the streak challenge's FitCoin (see below), which then
  // counts towards the totals and the draw like every other FitCoin source (see Firestore.getFitcoinAwards).
  //
  // Known limitation: if getAllStravaAthletesActivities fails for this week, publishWeeklyResults returns before
  // this ever runs, and - since only the scored week's dates are ever evaluated - that week's streak days (and, for
  // the challenge's final week, the streak award) wait until the week is re-run with
  // examples/publish-weekly-results.ts --week, like its leaderboard and goal scoring. The webhook's
  // athlete-deauthorization handling should make the usual cause (one athlete's revoked/invalid token blocking the
  // whole batch) far less common than it was before webhooks.
  private static async finalizeStreaks(
    config: SummerBodiesConfig,
    athletes: AthleteWithActivities[],
    weekStartUnix: number,
    weekEndUnix: number,
  ): Promise<{ streaks: StreakState[]; streakFitcoin: ContestantFitcoin[] }> {
    const weekDates = weekDateStrings(weekStartUnix, weekEndUnix);
    const result = await this.computeStreakUpdates(config, athletes, weekDates);
    if (!result) return { streaks: [], streakFitcoin: [] };
    const { updatedStreaks } = result;

    // Stored with set() (not added), so re-running the final week stores the same award.
    const streakFitcoin = Challenge.calculateStreakFitcoin(updatedStreaks, weekDates, config.challengeEndDate);
    if (streakFitcoin.length > 0) await Firestore.storeStreakFitcoin(streakFitcoin, config.challengeStartDate);
    await Firestore.saveStreaks(config.challengeStartDate, updatedStreaks);

    return { streaks: updatedStreaks, streakFitcoin };
  }

  // Makes the webhook-fed activity store match a live poll of the same window - see
  // activityStore.syncActivitiesIntoStore. Runs before the week's results are scored (from the same poll). Anything
  // the webhooks missed is reported, as a sign they aren't arriving (see also checkWebhookLiveness). A failure is
  // reported too, but doesn't stop the results: they're scored from the poll, not the store.
  private static async reconcileActivityStore(
    athletes: AthleteWithActivities[],
    startUnix: number,
    endUnix: number,
    config: SummerBodiesConfig,
  ): Promise<void> {
    try {
      const { missed, changed, removed } = await syncActivitiesIntoStore(athletes, startUnix, endUnix);
      if (missed.length > 0 || changed.length > 0 || removed.length > 0) {
        await reportWarning(
          `Strava webhooks missed ${missed.length} new activities, ${changed.length} edits and ${removed.length} removals last week (now fixed in the activity store)`,
          [
            ...missed.map((m) => `missed: ${m.athleteName} ${m.activityId} (${m.startDate})`),
            ...changed.map((id) => `changed: ${id}`),
            ...removed.map((id) => `removed: ${id}`),
          ].join("\n"),
          config,
        );
      }
    } catch (error) {
      await reportError("Couldn't reconcile the activity store with last week's live poll", error, config);
    }
  }

  // Derived from the athletes already fetched for the results above - no extra Firestore round-trip.
  private static mapRegisteredAthletes(athletes: AthleteWithActivities[]): RegisteredAthlete[] {
    return athletes.map((athlete) => ({ name: `${athlete.firstname} ${athlete.lastname}` })).sort((a, b) => a.name.localeCompare(b.name));
  }

  private static async getAllStravaAthletesActivities(
    strava: Strava,
    startUnixTime: number,
    endUnixTime: number,
  ): Promise<GetAllAthletesActivitiesResult & { ignoredDuplicates: IgnoredDuplicate[]; polledAthletes: AthleteWithActivities[] }> {
    const started = Date.now();
    const athletes = await Firestore.getRegisteredAthletes();
    const results = await strava.getAllAthletesActivities(
      athletes,
      startUnixTime,
      endUnixTime,
      async (id) => (await Firestore.getAthlete(id))?.refreshToken,
    );
    console.log(`Fetched ${athletes.length} athletes' Strava activities in ${((Date.now() - started) / 1000).toFixed(1)} s`);
    // Strava rotates the refresh token on every use, so persist the new one for everyone who was fetched
    // successfully - even when others failed and the caller discards the result.
    await Firestore.updateAthletesRefreshToken(results.athletesWithActivities);
    const { athletes: deduplicated, ignored } = Challenge.removeDuplicateActivities(results.athletesWithActivities);
    // polledAthletes keeps every recording, duplicates included, for the activity store - which holds whatever Strava
    // has (the webhooks store both recordings too) and drops duplicates only when scoring, like this does.
    return { ...results, athletesWithActivities: deduplicated, ignoredDuplicates: ignored, polledAthletes: results.athletesWithActivities };
  }

  // Screenshots each section of the results page separately (streak, FitCoin, goals, challenges) and uploads them to
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

  private static async publishFinal(slack: Slack, resultsUrl: string, images: ResultsImage[], weekStartUnix: number, weekEndUnix: number) {
    await slack.postResults(
      `The final results for ${datePretty(weekStartUnix)} - ${datePretty(weekEndUnix)} are out!\nSee the screenshots below`,
      images,
      resultsUrl,
    );
  }

  // The daily update's FitCoin: this week's so far, and the total so far. Only the weekly results store FitCoin, so
  // the total is the stored weeks plus this one - unless this week is outside the challenge, when it won't count. And
  // on Monday morning, before the weekly results (09:30) have stored last week, last week is added as the activity
  // store has it, so the total doesn't drop by a week for half an hour.
  private static async fitcoinSoFar(
    config: SummerBodiesConfig,
    weekFitcoin: ContestantFitcoin[],
    weekStartUnix: number,
  ): Promise<{ week: ContestantFitcoin[]; total: ContestantFitcoin[] }> {
    const challenge = { startDate: config.challengeStartDate, endDate: config.challengeEndDate };
    const lastWeek = weekLabel(moment.unix(weekStartUnix).subtract(1, "week"));
    let unstoredLastWeek: ContestantFitcoin[] | undefined;
    if (isChallengeAward(lastWeek, challenge) && !(await Firestore.hasWeeklyFitcoin(lastWeek))) {
      const lastWeekStart = moment.unix(weekStartUnix).subtract(1, "week").unix();
      const { athletes } = Challenge.removeDuplicateActivities(await getAthletesActivitiesFromStore(lastWeekStart, weekStartUnix));
      unstoredLastWeek = Challenge.calculateFitcoin(Challenge.calculateResults(athletes));
    }
    return Challenge.dailyFitcoin({
      stored: await this.challengeFitcoinTotals(config),
      week: weekFitcoin,
      weekCounts: isChallengeAward(weekLabel(moment.unix(weekStartUnix)), challenge),
      unstoredLastWeek,
    });
  }

  private static async challengeFitcoinTotals(config: SummerBodiesConfig): Promise<ContestantFitcoin[]> {
    return Firestore.getFitcoinTotals({ startDate: config.challengeStartDate, endDate: config.challengeEndDate });
  }
}
