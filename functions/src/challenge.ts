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
  StreakState,
  STREAK_MIN_DISTANCE_M,
} from "./challenge-models";

export interface IgnoredDuplicate {
  athlete: string;
  ignored: string;
  kept: string;
}

export class Challenge {
  // A person can't do two activities at once, so overlapping activities from one athlete are the same effort
  // recorded twice (e.g. a watch and a phone, or a watch app and a synced Fitbit). Of each overlapping group
  // only the shortest (by moving time, then elapsed time) is kept, so a duplicate can never inflate anyone's
  // totals. Two activities overlap when the overlap is more than half of the shorter one's elapsed time.
  //
  // Only activities in the same group (On Foot / On Wheels / Other) can be duplicates: a short Workout logged
  // during a long walk is a separate recording, and dropping the walk for it could cost the athlete their
  // streak day - an elimination that can never be undone.
  static removeDuplicateActivities(athletes: AthleteWithActivities[]): { athletes: AthleteWithActivities[]; ignored: IgnoredDuplicate[] } {
    const ignored: IgnoredDuplicate[] = [];
    const describe = (activity: Activity) =>
      `${activity.name} ${activity.start_date_local.slice(0, 16).replace("T", " ")} (${Math.round(activity.moving_time / 60)} min)`;
    const bounds = (activity: Activity) => {
      const start = Date.parse(activity.start_date);
      return { start, end: start + activity.elapsed_time * 1000 };
    };
    const overlaps = (a: Activity, b: Activity) => {
      if (Challenge.toOurActivity(a.type) !== Challenge.toOurActivity(b.type)) return false;
      const [x, y] = [bounds(a), bounds(b)];
      const overlapMs = Math.min(x.end, y.end) - Math.max(x.start, y.start);
      return overlapMs > 0.5 * Math.min(a.elapsed_time, b.elapsed_time) * 1000;
    };

    const deduplicated = athletes.map((athlete) => {
      const shortestFirst = [...athlete.activities].sort(
        (a, b) => a.moving_time - b.moving_time || a.elapsed_time - b.elapsed_time || a.start_date.localeCompare(b.start_date) || a.id - b.id,
      );
      const kept: Activity[] = [];
      for (const activity of shortestFirst) {
        const duplicateOf = kept.find((other) => overlaps(activity, other));
        if (duplicateOf) {
          ignored.push({ athlete: `${athlete.firstname} ${athlete.lastname}`, ignored: describe(activity), kept: describe(duplicateOf) });
        } else {
          kept.push(activity);
        }
      }
      return { ...athlete, activities: athlete.activities.filter((activity) => kept.includes(activity)) };
    });

    return { athletes: deduplicated, ignored };
  }

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
          const contestantResult = { name: contestant.name, total: contestant.total, fitcoin: fitcoin, activityTypes: contestant.activityTypes };
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

  static calculateGoalResults(athletes: AthleteWithActivities[], fitcoinAwarded: number): GoalResult[] {
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

  // Advances each athlete's 1km-a-day streak across `challengeDates` (ascending "YYYY-MM-DD" dates, evaluated in
  // order against each activity's calendar day in the athlete's own timezone). Once a date has no qualifying
  // activity, the athlete is frozen as eliminated (`alive: false`) with whatever streak they'd built up, and
  // stays that way on every later call regardless of what they log afterwards.
  //
  // Dates up to the athlete's `lastEvaluatedDate` are skipped, so passing the same dates again is a no-op.
  //
  // A streak can only be started from the challenge's first day: an athlete with no stored streak while others
  // already have one registered after the first week was evaluated, so they're stored as eliminated with no days
  // (still free to take part in everything else). Keyed on other athletes' records rather than on the dates, so
  // if the first week's job failed for everyone, everyone still starts together.
  //
  // `challengeDates` is deliberately the caller's responsibility: activities can be uploaded to Strava late (up to
  // Sunday 23:59 for that week, per the challenge rules), so callers should only pass dates whose upload window has
  // fully closed - see Bot.finalizeStreaks, which only evaluates a week once that week has ended.
  static calculateStreakUpdates(
    athletes: AthleteWithActivities[],
    previousStreaks: Map<string, StreakState>,
    challengeDates: string[],
  ): StreakState[] {
    return athletes.map((athlete) => {
      const name = `${athlete.firstname} ${athlete.lastname}`;
      const lateStarter = previousStreaks.size > 0 && !previousStreaks.has(athlete.id);
      const previous = previousStreaks.get(athlete.id) ?? { athleteId: athlete.id, name, alive: !lateStarter, currentStreak: 0 };

      if (!previous.alive) return { ...previous, name };

      const qualifyingDates = new Set(
        athlete.activities
          .filter((activity) => Challenge.toOurActivity(activity.type) === ActivityType.OnFoot && activity.distance >= STREAK_MIN_DISTANCE_M)
          .map((activity) => activity.start_date_local.slice(0, 10)),
      );

      const pendingDates = challengeDates.filter((date) => !previous.lastEvaluatedDate || date > previous.lastEvaluatedDate);
      if (pendingDates.length === 0) return { ...previous, name };

      let alive = true;
      let currentStreak = previous.currentStreak;
      for (const date of pendingDates) {
        if (!qualifyingDates.has(date)) {
          alive = false;
          break;
        }
        currentStreak++;
      }

      return { athleteId: athlete.id, name, alive, currentStreak, lastEvaluatedDate: pendingDates[pendingDates.length - 1] };
    });
  }

  // Sums each contestant's FitCoin across several lists (e.g. the weekly results and the streak award).
  static combineFitcoin(...lists: ContestantFitcoin[][]): ContestantFitcoin[] {
    const totals = new Map<string, number>();
    for (const contestant of lists.flat()) {
      totals.set(contestant.name, (totals.get(contestant.name) ?? 0) + contestant.fitcoin);
    }
    return [...totals].map(([name, fitcoin]) => ({ name, fitcoin })).sort(compareContestantFitcoin);
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
    // Unlike the Map-based events above, which are naturally absent when nothing qualifies, this needs an
    // explicit check - otherwise Mile Challenge would always render, with empty tables, when nobody's logged
    // a mile-range run that week.
    const mileEvents = activities.filter(this.isMileEvent);
    if (mileEvents.length > 0) {
      eventResult.push(this.getMileChallengeGroupings(mileEvents));
    }
    return eventResult.sort(this.compareStravaEvents);
  }

  private static getMileChallengeGroupings(mileEvents: OurEvent[]): ChallengeEvent {
    let event: ChallengeEvent = {
      name: ActivityType.MileChallenge,
      groupings: [this.getGroupingTotals(mileEvents, GroupingType.Attempts), this.getGroupingTotals(mileEvents, GroupingType.Pace)],
    };

    return event;
  }

  private static isMileEvent(activity: OurEvent): boolean {
    return Challenge.toOurActivity(activity.type) === ActivityType.OnFoot && activity.distanceM >= 1500 && activity.distanceM <= 2000;
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
          distanceM: activity.distance,
          movingTimeS: activity.moving_time,
          elapsedTimeS: activity.elapsed_time,
          totalElevationGainM: activity.total_elevation_gain,
          eventName: activity.name,
          type: activity.type.toString(),
          sportType: activity.sport_type ?? activity.type,
        };
        if (Challenge.toOurActivity(event.type) == ActivityType.Other) {
          event.movingTimeS = activity.elapsed_time;
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

  static toOurActivity(activity: string): ActivityType {
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
    let activityTypes = new Map<string, Set<string>>();

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

      const types = activityTypes.get(activity.athleteId) ?? new Set<string>();
      types.add(activity.sportType);
      activityTypes.set(activity.athleteId, types);
    });

    // Rounded before sorting, so ranks and ties (which share FitCoin) match the totals shown.
    let c = Array.from(contestants, ([athleteId, value]) => ({
      ...value,
      total: this.roundTotal(value.total, type),
      activityTypes: Array.from(activityTypes.get(athleteId) ?? []).sort(),
    }));
    c = c.sort(this.compareContestant);
    if (type === GroupingType.Pace) c = c.reverse();

    const grouping: Grouping = {
      name: type,
      contestants: c,
      unit: units[type],
    };
    return grouping;
  }

  // Exact per activity - only the total is rounded (roundTotal), so many short activities aren't each rounded
  // down (or up) to a whole km/minute/metre.
  private static getGroupingValue(activity: OurEvent, type: GroupingType): number {
    switch (type) {
      case GroupingType.Distance:
        return activity.distanceM / 1000;
      case GroupingType.Duration:
        return activity.movingTimeS / 60;
      case GroupingType.Elevation:
        return activity.totalElevationGainM;
      case GroupingType.Attempts:
        return 1;
      case GroupingType.Pace: // In min/km
        return activity.elapsedTimeS / 60 / (activity.distanceM / 1000);
    }
  }

  // Distance to 0.1km, duration and elevation to whole minutes/metres; pace is shown to 2 decimals by the website.
  private static roundTotal(total: number, type: GroupingType): number {
    if (type === GroupingType.Distance) return Math.round(total * 10) / 10;
    if (type === GroupingType.Pace) return total;
    return Math.round(total);
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
