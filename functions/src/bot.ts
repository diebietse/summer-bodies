import { Firestore } from "./firestore";
import { Strava } from "./strava";
import { Slack } from "./slack";
import { Format } from "./format";
import { AthleteWithActivities } from "./challenge-models";
import { Challenge } from "./challenge";
import { getCurrentWeekUnix, getPreviousWeek, getPreviousWeekUnix, now } from "./util";

export class Bot {
  static async publishDailyUpdates() {
    const config = await Firestore.getConfig();
    const newToken = await Strava.getToken(config.stravaClientId, config.stravaClientSecret, config.stravaRefreshToken);
    await Firestore.updateRefreshToken(newToken.refresh_token);
    const strava = new Strava(config.stravaClientId, config.stravaClientSecret);
    const slack = new Slack(config.slackWebhookUrl);

    const allActivities = await this.getAllStravaAthletesActivities(strava, getCurrentWeekUnix(), now());

    await this.publishInProgressTop5s(slack, allActivities);
    await this.publishInProgressGoalStatus(slack, allActivities);
  }

  static async publishWeeklyResults() {
    const config = await Firestore.getConfig();
    const strava = new Strava(config.stravaClientId, config.stravaClientSecret);
    const slack = new Slack(config.slackWebhookUrl);

    const allActivities = await this.getAllStravaAthletesActivities(strava, getPreviousWeekUnix(), getCurrentWeekUnix());

    await this.publishFinalTop5s(slack, allActivities);
    await this.publishFinalGoalStatus(slack, allActivities);
    await this.publishWeeklyFitcoin(slack, allActivities);
    await this.publishTotalFitcoin(slack);
  }

  private static async getAllStravaAthletesActivities(strava: Strava, startUnixTime: number,endUnixTime: number): Promise<AthleteWithActivities[]> {
    const athletes = await Firestore.getRegisteredAthletes();
    const allActivities = await strava.getAllAthletesActivities(athletes, startUnixTime, endUnixTime);
    Firestore.updateAthletesRefreshToken(allActivities);
    return allActivities
  }

  private static async publishInProgressTop5s(slack: Slack, athletesWithActivities: AthleteWithActivities[]) {
    const clubs = await Challenge.calculateActivities(athletesWithActivities);

    for (const club of clubs) {
      await slack.post(Format.inProgressClubTop5(club));
    }
  }

  private static async publishFinalTop5s(slack: Slack, athletesWithActivities: AthleteWithActivities[]) {
    const clubs = await Challenge.calculateActivities(athletesWithActivities);
    for (const club of clubs) {
      await slack.post(Format.finalClubTop5(club));
    }
  }

  private static async publishWeeklyFitcoin(slack: Slack, athletesWithActivities: AthleteWithActivities[]) {
    const contestantFitcoin = await Challenge.calculateFitcoin(athletesWithActivities);
    const lastWeek = getPreviousWeek();
    await Firestore.storeFitcoin(contestantFitcoin, lastWeek);
    await slack.post(Format.fitcoinStatus("Last Week's Fitcoin Results", contestantFitcoin));
  }

  private static async publishTotalFitcoin(slack: Slack) {
    const totalFitcoin = await Firestore.getFitcoinTotals();
    await slack.post(Format.fitcoinStatus("Total Fitcoin Results", totalFitcoin));
  }

  private static async publishInProgressGoalStatus(slack: Slack, athletesWithActivities: AthleteWithActivities[]) {
    const progress = await Challenge.calculateProgress(athletesWithActivities);
    await slack.post(Format.goalStatus("In Progress Goal Status", progress));
  }

  private static async publishFinalGoalStatus(slack: Slack, athletesWithActivities: AthleteWithActivities[]) {
    const progress = await Challenge.calculateProgress(athletesWithActivities);
    await slack.post(Format.goalStatus("Last Week's Goal Results", progress));
  }
}
