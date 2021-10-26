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
} from "./challenge-models";

export class Challenge {
  static async calculateActivities(activities: OurEvent[]): Promise<Club[]> {
    let clubs = new Map<string, OurEvent[]>();
    activities.forEach((activity) => {
      const club: OurEvent[] = clubs.get(activity.club) || [];
      club.push(activity);
      clubs.set(activity.club, club);
    });

    let allClubs: Club[] = [];
    for (let [club, clubActivities] of clubs) {
      let clubResult: Club = {
        name: club,
        events: this.getClubEvents(clubActivities),
      };
      allClubs.push(clubResult);
    }
    return allClubs.sort(this.compareClubs);
  }

  static async calculateProgress(activities: OurEvent[]): Promise<WeeklyResult[]> {
    let athletes = new Map<string, OurEvent[]>();
    activities.forEach((activity) => {
      if (activity.movingTime >= 60 * 30) {
        const validActivities: OurEvent[] = athletes.get(activity.athleteId) || [];
        validActivities.push(activity);
        athletes.set(activity.athleteId, validActivities);
      }
    });

    let weekResults: WeeklyResult[] = [];
    for (let [_, validActivities] of athletes) {
      let achieved = false;
      if (validActivities.length >= 3) {
        achieved = true;
      }
      let result: WeeklyResult = {
        name: `${validActivities[0].firstName} ${validActivities[0].lastName}`,
        achieved: achieved,
        activities: validActivities.length,
        totalTimeMin: this.getTotalDurationMin(validActivities),
        goal: 3,
      };
      weekResults.push(result);
    }
    return weekResults.sort(this.compareWeeklyResult);
  }

  static async calculateFitcoin(activities: OurEvent[]): Promise<ContestantFitcoin[]> {
    let clubs = await this.calculateActivities(activities);
    let fitcoinTotals = new Map<string, number>();
    clubs.forEach((club) => {
      club.events.forEach((event) => {
        event.groupings.forEach((grouping) => {
          let fitcoinAwarded: number = 5;
          for (let contestant of grouping.contestants) {
            console.log(`${club.name}/${event.name}/${grouping.name}/${contestant.name} : ${fitcoinAwarded} fitcoin`)
            let total = fitcoinTotals.get(contestant.name) || 0;
            total += fitcoinAwarded;
            fitcoinTotals.set(contestant.name, total);
            fitcoinAwarded--;
            if (fitcoinAwarded <= 0) {
              break;
            }
          }
        });
      });
    });

    const progress = await Challenge.calculateProgress(activities);
    progress.forEach((result) => {
      if (result.achieved) {
        console.log(`${result.name} weekly goal: 10 fitcoin`)
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

  private static getTotalDurationMin(activities: OurEvent[]): number {
    let total: number = 0;
    activities.forEach((activity) => {
      total += activity.movingTime;
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
    return eventResult.sort(this.compareStavaEvents);
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
    };

    activities.forEach((activity) => {
      let contestant = contestants.get(activity.athleteId);
      if (!contestant) {
        contestant = {
          name: `${activity.firstName} ${activity.lastName}`,
          total: 0,
        };
      }
      contestant.total = contestant.total + this.getGroupingValue(activity, type);
      contestants.set(activity.athleteId, contestant);
    });

    let c = Array.from(contestants, ([_name, value]) => value);
    const grouping: Grouping = {
      name: type,
      contestants: c.sort(this.compareContestant),
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
    }
  }

  private static compareStavaEvents(a: StravaEvent, b: StravaEvent) {
    if (a.name > b.name) return 1;
    if (a.name < b.name) return -1;
    return 0;
  }

  private static compareClubs(a: Club, b: Club) {
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
