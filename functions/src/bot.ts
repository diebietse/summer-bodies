import { Firestore } from "./firestore";
import { Strava, CreateActivityRequest } from "./strava";
import { Slack } from "./slack";
import { Format } from "./format";
import { Challenge } from "./challenge";
import { getCurrentWeek, getPreviousWeek } from "./util";
import { OurEvent } from "./challenge-models";

export class Bot {
  static async publishDailyUpdates() {
    const config = await Firestore.getConfig();
    const newToken = await Strava.getToken(config.stravaClientId, config.stravaClientSecret, config.stravaRefreshToken);
    await Firestore.updateRefreshToken(newToken.refresh_token);
    const strava = new Strava(newToken.access_token, config.stravaBotId, config.stravaClubs);
    const slack = new Slack(config.slackWebhookUrl);

    await this.publishInProgressTop5s(strava, slack);
    await this.publishInProgressGoalStatus(strava, slack);
  }

  static async runWeeklyMaintenance() {
    const config = await Firestore.getConfig();
    const newToken = await Strava.getToken(config.stravaClientId, config.stravaClientSecret, config.stravaRefreshToken);
    const strava = new Strava(newToken.access_token, config.stravaBotId, config.stravaClubs);

    await this.createWeeklyPlaceholder(strava);
  }

  static async publishWeeklyResults() {
    const config = await Firestore.getConfig();
    const newToken = await Strava.getToken(config.stravaClientId, config.stravaClientSecret, config.stravaRefreshToken);
    const strava = new Strava(newToken.access_token, config.stravaBotId, config.stravaClubs);
    const slack = new Slack(config.slackWebhookUrl);

    const allActivities = await strava.getLastWeeksActivitiesAllClubs();

    await this.publishFinalTop5s(slack, allActivities);
    await this.publishFinalGoalStatus(slack, allActivities);
    await this.publishWeeklyFitcoin(slack, allActivities);
    await this.publishTotalFitcoin(slack);
  }

  private static async publishInProgressTop5s(strava: Strava, slack: Slack) {
    const allActivities = await strava.getThisWeeksActivitiesAllClubs();
    const clubs = await Challenge.calculateActivities(allActivities);

    for (const club of clubs) {
      await slack.post(Format.inProgressClubTop5(club));
    }
  }

  private static async publishFinalTop5s(slack: Slack, allActivities: OurEvent[]) {
    const clubs = await Challenge.calculateActivities(allActivities);
    for (const club of clubs) {
      await slack.post(Format.finalClubTop5(club));
    }
  }

  private static async publishWeeklyFitcoin(slack: Slack, allActivities: OurEvent[]) {
    const contestantFitcoin = await Challenge.calculateFitcoin(allActivities);
    const lastWeek = getPreviousWeek();
    await Firestore.storeFitcoin(contestantFitcoin, lastWeek);
    await slack.post(Format.fitcoinStatus("Last Week's Fitcoin Results", contestantFitcoin));
  }

  private static async publishTotalFitcoin(slack: Slack) {
    const totalFitcoin = await Firestore.getFitcoinTotals();
    await slack.post(Format.fitcoinStatus("Total Fitcoin Results", totalFitcoin));
  }

  private static async publishInProgressGoalStatus(strava: Strava, slack: Slack) {
    const allActivities = await strava.getThisWeeksActivitiesAllClubs();
    const progress = await Challenge.calculateProgress(allActivities);
    await slack.post(Format.goalStatus("In Progress Goal Status", progress));
  }

  private static async publishFinalGoalStatus(slack: Slack, allActivities: OurEvent[]) {
    const progress = await Challenge.calculateProgress(allActivities);
    await slack.post(Format.goalStatus("Last Week's Goal Results", progress));
  }

  static async createWeeklyPlaceholder(strava: Strava) {
    const activity: CreateActivityRequest = {
      name: "Weekly Activity",
      type: "Run",
      start_date_local: getCurrentWeek().toISOString(),
      elapsed_time: 1 * 60 * 20,
    };

    try {
      await strava.createActivity(activity);
    } catch (e) {
      console.error(`Error creating activity: ${e.response?.status} ${e.response?.statusText}`);
      console.error(e.response?.data);
    }
  }
}
