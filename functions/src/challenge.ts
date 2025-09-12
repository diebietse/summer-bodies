import {
  Club,
  ActivityType,
  GroupingType,
  Grouping,
  Contestant,
  StravaEvent,
  WeeklyResult,
  ContestantFitcoin,
  OurEvent,
  compareContestantFitcoin,
  Activity,
  AthleteWithActivities,
} from "./challenge-models";

export class Challenge {
  static calculateActivitiesAll(athletes: AthleteWithActivities[]): Club {
    const activities = this.athletesToOurEvents(athletes);
    let clubs = new Map<string, OurEvent[]>();
    activities.forEach((activity) => {
      const club: OurEvent[] = clubs.get(activity.club) || [];
      club.push(activity);
      clubs.set(activity.club, club);
    });

    let allClubs: Club[] = [];
    for (let [_, clubActivities] of clubs) {
      let clubResult: Club = {
        name: "all",
        events: this.getClubEvents(clubActivities),
      };
      allClubs.push(clubResult);
    }
    return allClubs[0];
  }

  static async calculateProgress(athletes: AthleteWithActivities[]): Promise<WeeklyResult[]> {
    let weekResults: WeeklyResult[] = [];
    for (let athlete of athletes) {
      const validActivities: Activity[] = [];
      athlete.activities.forEach((activity) => {
        if (activity.moving_time >= 60 * 29) {
          validActivities.push(activity);
        }
      });

      const achieved = validActivities.length >= 3;
      let result: WeeklyResult = {
        name: `${athlete.firstname} ${athlete.lastname}`,
        achieved: achieved,
        activities: validActivities.length,
        totalTimeMin: this.getTotalDurationMin(validActivities),
        goal: 3,
      };
      weekResults.push(result);
    }
    return weekResults.sort(this.compareWeeklyResult);
  }

  static async calculateFitcoin(athletes: AthleteWithActivities[]): Promise<ContestantFitcoin[]> {
    let club = this.calculateActivitiesAll(athletes);
    let fitcoinTotals = new Map<string, number>();

    club.events.forEach((event) => {
      event.groupings.forEach((grouping) => {
        const contestantCount = grouping.contestants.length;
        const fitcoinModifier = contestantCount > 5 ? Math.floor(contestantCount / 5) : 1; // number of people that get each tier of fitcoin
        let count = 0;
        let fitcoinAwarded = contestantCount > 5 ? 5 : contestantCount;
        for (let contestant of grouping.contestants) {
          console.log(`${event.name}/${grouping.name}/${contestant.name} : ${fitcoinAwarded} fitcoin`);
          let total = fitcoinTotals.get(contestant.name) || 0;
          total += fitcoinAwarded;
          fitcoinTotals.set(contestant.name, total);
          count++;
          if (count % fitcoinModifier == 0) fitcoinAwarded--;
          if (fitcoinAwarded <= 0) break;
        }
      });
    });

    const progress = await Challenge.calculateProgress(athletes);
    progress.forEach((result) => {
      if (result.achieved) {
        console.log(`${result.name} weekly goal: 10 fitcoin`);
        let total = fitcoinTotals.get(result.name) || 0;
        total += 10;
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

  private static getClubEvents(activities: OurEvent[]): StravaEvent[] {
    let events = new Map<ActivityType, OurEvent[]>();
    activities.forEach((activity) => {
      const type = this.toOurActivity(activity.type);
      const event: OurEvent[] = events.get(type) || [];
      event.push(activity);
      events.set(type, event);
    });

    let eventResult: StravaEvent[] = [];
    for (let [event, eventActivities] of events) {
      eventResult.push(this.getEventGroupings(eventActivities, event));
    }
    eventResult.push(this.getMileChallengeGroupings(activities));
    return eventResult.sort(this.compareStravaEvents);
  }

  private static getMileChallengeGroupings(activities: OurEvent[]): StravaEvent {
    const mileEvents = activities.filter(this.isMileEvent);

    let event: StravaEvent = {
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
        events.push(event);
      }
    }
    return events;
  }

  private static getEventGroupings(activities: OurEvent[], eventType: ActivityType): StravaEvent {
    let event: StravaEvent = {
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

  private static compareStravaEvents(a: StravaEvent, b: StravaEvent) {
    if (a.name > b.name) return 1;
    if (a.name < b.name) return -1;
    return 0;
  }

  private static compareContestant(a: Contestant, b: Contestant) {
    if (a.total < b.total) return 1;
    if (a.total > b.total) return -1;
    return 0;
  }

  private static compareWeeklyResult(a: WeeklyResult, b: WeeklyResult) {
    if (a.name > b.name) return 1;
    if (a.name < b.name) return -1;
    return 0;
  }
}
