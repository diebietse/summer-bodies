import {
  ActivityType,
  GroupingType,
  Grouping,
  Contestant,
  ChallengeEvent,
  GoalResult,
  ContestantFitcoin,
  OurEvent,
  compareContestantFitcoin,
  Activity,
  AthleteWithActivities,
  ChallengeResults,
} from "./challenge-models";

export class Challenge {
  private static getChallengeEvents(athletes: AthleteWithActivities[]): ChallengeEvent[] {
    const events = this.athletesToOurEvents(athletes);
    return this.ourEventsToChallengeEvents(events);
  }

  static calculateResults(athletes: AthleteWithActivities[]): ChallengeResults {
    const challengeEvents = this.getChallengeEvents(athletes);
    const topResults: ChallengeEvent[] = [];

    challengeEvents.forEach((event) => {
      const maxFitcoin = event.name == ActivityType.Other ? 10 : 5;

      const groupingResults: Grouping[] = [];

      event.groupings.forEach((grouping) => {
        const contestantResults: Contestant[] = [];

        const contestantCount = grouping.contestants.length;
        const fitcoinModifier = contestantCount > maxFitcoin ? Math.floor(contestantCount / maxFitcoin) : 1; // number of people that get each tier of fitcoin
        let count = 0;
        let fitcoinAwarded = contestantCount > maxFitcoin ? maxFitcoin : contestantCount;
        let previousContestant: Contestant | null = null;
        for (let contestant of grouping.contestants) {
          // If there was a draw, give contestants the same number of points
          const fitcoin: number = previousContestant?.total === contestant.total ? previousContestant.fitcoin! : fitcoinAwarded;
          const contestantResult = { name: contestant.name, total: contestant.total, fitcoin: fitcoin };
          contestantResults.push(contestantResult);
          console.log(`${event.name}/${grouping.name}/${contestant.name} : ${fitcoinAwarded} fitcoin`);
          count++;
          if (count % fitcoinModifier == 0) fitcoinAwarded--;
          if (fitcoinAwarded <= 0) break;
          previousContestant = contestantResult;
        }

        groupingResults.push({ name: grouping.name, unit: grouping.unit, contestants: contestantResults });
      });

      topResults.push({ name: event.name, groupings: groupingResults });
    });

    const goalResults = Challenge.calculateGoalResults(athletes, 10);
    return { topResults: topResults, goalResults: goalResults };
  }

  private static calculateGoalResults(athletes: AthleteWithActivities[], fitcoinAwarded: number): GoalResult[] {
    let weekResults: GoalResult[] = [];
    for (let athlete of athletes) {
      const validActivities: Activity[] = [];
      athlete.activities.forEach((activity) => {
        if (Challenge.toOurActivity(activity.type) == ActivityType.Other) {
          activity.moving_time = activity.elapsed_time;
        }
        if (activity.moving_time >= 60 * 29) {
          validActivities.push(activity);
        }
      });

      if (validActivities.length === 0) continue;
      const achieved = validActivities.length >= 3;
      let result: GoalResult = {
        name: `${athlete.firstname} ${athlete.lastname}`,
        achieved: achieved,
        fitcoin: achieved ? fitcoinAwarded : 0,
        activities: validActivities.length,
        totalTimeMin: this.getTotalDurationMin(validActivities),
        goal: 3,
      };
      weekResults.push(result);
    }
    return weekResults.sort(this.compareWeeklyResult);
  }

  static calculateFitcoin(results: ChallengeResults): ContestantFitcoin[] {
    const topResults = results.topResults;
    let fitcoinTotals = new Map<string, number>();

    topResults.forEach((event) => {
      event.groupings.forEach((grouping) => {
        for (let contestant of grouping.contestants) {
          console.log(`${event.name}/${grouping.name}/${contestant.name} : ${contestant.fitcoin} fitcoin`);
          let total = fitcoinTotals.get(contestant.name) || 0;
          total += contestant.fitcoin || 0;
          fitcoinTotals.set(contestant.name, total);
        }
      });
    });

    const goalResults = results.goalResults;
    goalResults.forEach((result) => {
      if (result.achieved) {
        console.log(`${result.name} weekly goal: 10 fitcoin`);
        let total = fitcoinTotals.get(result.name) || 0;
        total += result.fitcoin;
        fitcoinTotals.set(result.name, total);
      }
    });

    let fitcoins: ContestantFitcoin[] = [];
    for (let [name, fitcoin] of fitcoinTotals) {
      let contestant: ContestantFitcoin = {
        name: name,
        fitcoin: fitcoin,
      };
      fitcoins.push(contestant);
    }
    return fitcoins.sort(compareContestantFitcoin);
  }

  private static getTotalDurationMin(activities: Activity[]): number {
    let total: number = 0;
    activities.forEach((activity) => {
      total += activity.moving_time;
    });
    return Math.round(total / 60);
  }

  private static ourEventsToChallengeEvents(activities: OurEvent[]): ChallengeEvent[] {
    let events = new Map<ActivityType, OurEvent[]>();
    activities.forEach((activity) => {
      const type = this.toOurActivity(activity.type);
      const event: OurEvent[] = events.get(type) || [];
      event.push(activity);
      events.set(type, event);
    });

    let eventResult: ChallengeEvent[] = [];
    for (let [event, eventActivities] of events) {
      eventResult.push(this.getEventGroupings(eventActivities, event));
    }
    eventResult.push(this.getMileChallengeGroupings(activities));
    return eventResult.sort(this.compareStravaEvents);
  }

  private static getMileChallengeGroupings(activities: OurEvent[]): ChallengeEvent {
    const mileEvents = activities.filter(this.isMileEvent);

    let event: ChallengeEvent = {
      name: ActivityType.MileChallenge,
      groupings: [
        this.getGroupingTotals(mileEvents, GroupingType.Attempts),
        this.getGroupingTotals(mileEvents, GroupingType.Pace),
      ],
    };

    return event;
  }

  private static isMileEvent(activity: OurEvent): boolean {
    return (
      Challenge.toOurActivity(activity.type) === ActivityType.OnFoot &&
      activity.distance > 1500 &&
      activity.distance < 2000
    );
  }

  private static athletesToOurEvents(athletes: AthleteWithActivities[]): OurEvent[] {
    let events: OurEvent[] = [];
    for (let athlete of athletes) {
      for (let activity of athlete.activities) {
        const event: OurEvent = {
          athleteId: athlete.id,
          firstName: athlete.firstname,
          lastName: athlete.lastname,
          id: activity.id.toString(),
          distance: activity.distance,
          movingTime: activity.moving_time,
          totalElevationGain: activity.total_elevation_gain,
          averageSpeed: activity.average_speed,
          eventName: activity.name,
          type: activity.type.toString(),
          club: athlete.club,
        };
        if (Challenge.toOurActivity(event.type) == ActivityType.Other) {
          event.movingTime = activity.elapsed_time;
        }
        events.push(event);
      }
    }
    return events;
  }

  private static getEventGroupings(activities: OurEvent[], eventType: ActivityType): ChallengeEvent {
    let event: ChallengeEvent = {
      name: eventType,
      groupings: [this.getGroupingTotals(activities, GroupingType.Duration)],
    };

    if (eventType != ActivityType.Other) {
      event.groupings.push(this.getGroupingTotals(activities, GroupingType.Distance));
      event.groupings.push(this.getGroupingTotals(activities, GroupingType.Elevation));
    }

    return event;
  }

  private static toOurActivity(activity: string): ActivityType {
    switch (activity) {
      case "Hike":
      case "Run":
      case "Walk":
        return ActivityType.OnFoot;
      case "Ride":
      case "VirtualRide":
      case "Wheelchair":
        return ActivityType.OnWheels;
      default:
        return ActivityType.Other;
    }
  }

  private static getGroupingTotals(activities: OurEvent[], type: GroupingType): Grouping {
    let contestants = new Map<string, Contestant>();

    const units = {
      Distance: "km",
      Duration: "min",
      Elevation: "m",
      Attempts: "",
      Pace: "min/km",
    };

    activities.forEach((activity) => {
      let contestant = contestants.get(activity.athleteId);
      if (!contestant) {
        contestant = {
          name: `${activity.firstName} ${activity.lastName}`,
          total: 0,
        };
      }
      if (type === GroupingType.Pace) {
        if (contestant.total === 0) {
          contestant.total = this.getGroupingValue(activity, type);
        } else {
          contestant.total = Math.min(contestant.total, this.getGroupingValue(activity, type));
        }
      } else {
        contestant.total = contestant.total + this.getGroupingValue(activity, type);
      }

      contestants.set(activity.athleteId, contestant);
    });

    let c = Array.from(contestants, ([_name, value]) => value);
    c = c.sort(this.compareContestant);
    if (type === GroupingType.Pace) c = c.reverse();

    const grouping: Grouping = {
      name: type,
      contestants: c,
      unit: units[type],
    };
    return grouping;
  }

  private static getGroupingValue(activity: OurEvent, type: GroupingType): number {
    switch (type) {
      case GroupingType.Distance:
        return Math.round(activity.distance / 1000);
      case GroupingType.Duration:
        return Math.round(activity.movingTime / 60);
      case GroupingType.Elevation:
        return Math.round(activity.totalElevationGain);
      case GroupingType.Attempts:
        return 1;
      case GroupingType.Pace:
        return 1000 / (60 * activity.averageSpeed);
    }
  }

  private static compareStravaEvents(a: ChallengeEvent, b: ChallengeEvent) {
    if (a.name > b.name) return 1;
    if (a.name < b.name) return -1;
    return 0;
  }

  private static compareContestant(a: Contestant, b: Contestant) {
    if (a.total < b.total) return 1;
    if (a.total > b.total) return -1;
    return 0;
  }

  private static compareWeeklyResult(a: GoalResult, b: GoalResult) {
    if (a.name > b.name) return 1;
    if (a.name < b.name) return -1;
    return 0;
  }
}
