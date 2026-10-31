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
  // streak day.
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
      // Other (every sport without its own category) has only one ranking, against three for On Foot, three for On
      // Wheels and the Mile Challenge's two, so each of its tiers pays double - or someone who mainly does Other could
      // earn far less in a week than a runner, however hard they train.
      const fitcoinPerTier = event.name == ActivityType.Other ? 2 : 1;

      const groupingResults: Grouping[] = [];

      event.groupings.forEach((grouping) => {
        const contestantResults: Contestant[] = [];

        const contestantCount = grouping.contestants.length;
        const fitcoinModifier = contestantCount > maxFitcoin ? Math.floor(contestantCount / maxFitcoin) : 1; // number of people that get each tier of fitcoin
        let count = 0;
        let fitcoinAwarded = contestantCount > maxFitcoin ? maxFitcoin : contestantCount;
        let previousContestant: Contestant | null = null;
        for (let contestant of grouping.contestants) {
          // If there was a draw, give contestants the same number of points - including a draw with the last
          // place that earns FitCoin, so nobody tied with them is cut off.
          const tied = previousContestant?.total === contestant.total;
          if (!tied && fitcoinAwarded <= 0) break;
          const fitcoin: number = tied ? previousContestant!.fitcoin! : fitcoinAwarded * fitcoinPerTier;
          const contestantResult = { name: contestant.name, total: contestant.total, fitcoin: fitcoin, activityTypes: contestant.activityTypes };
          contestantResults.push(contestantResult);
          console.log(`${event.name}/${grouping.name}/${contestant.name} : ${fitcoin} fitcoin`);
          count++;
          if (count % fitcoinModifier == 0) fitcoinAwarded--;
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

  // The streak challenge's FitCoin, scored once, when the week containing `challengeEndDate` is finalized: 1 FitCoin
  // per day of each athlete's longest streak. Squared on its own in the lucky draw, a streak covering N weeks already
  // weighs N times as much as the same FitCoin paid a week at a time (4 times for the whole challenge), so 1 a day is
  // enough to make every-day activity count. Empty in every other week.
  static calculateStreakFitcoin(streaks: StreakState[], weekDates: string[], challengeEndDate: string): ContestantFitcoin[] {
    if (!weekDates.includes(challengeEndDate)) return [];
    return streaks
      .map((streak) => ({ name: streak.name, fitcoin: streak.longestStreak }))
      .filter((contestant) => contestant.fitcoin > 0)
      .sort(compareContestantFitcoin);
  }

  // Fills in what a stored streak doc saved by older code lacks, given when it was last written:
  // * lastEvaluatedDate: docs saved before it existed were only ever written by the Monday weekly job, for the week
  //   that had just ended - so derive it from the write time, or re-running that week would count it twice.
  // * longestStreak: docs saved before it existed (when a missed day ended your streak for good) had no longer run
  //   than their currentStreak. An eliminated one (`alive: false`) kept the streak it was knocked out on, which is
  //   its longest but no longer current - carrying it on would treat the missed day as never having happened.
  static withStreakDefaults(stored: StreakState & { alive?: boolean }, lastDayOfWeekWritten: string): StreakState {
    const { alive, ...streak } = stored;
    return {
      ...streak,
      lastEvaluatedDate: streak.lastEvaluatedDate ?? lastDayOfWeekWritten,
      longestStreak: streak.longestStreak ?? streak.currentStreak,
      currentStreak: alive === false ? 0 : streak.currentStreak,
    };
  }

  // Advances each athlete's 1km-a-day streak across `challengeDates` (ascending "YYYY-MM-DD" dates, evaluated in
  // order against each activity's calendar day in the athlete's own timezone). A day with a qualifying activity
  // extends the current streak, a day without one resets it to 0, and `longestStreak` keeps the best run so far.
  // Nobody is ever eliminated, so a streak can start on any day of the challenge - also by someone who joins late.
  //
  // Dates up to the athlete's `lastEvaluatedDate` are skipped, so passing the same dates again is a no-op.
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
      const previous = previousStreaks.get(athlete.id) ?? { athleteId: athlete.id, name, currentStreak: 0, longestStreak: 0 };

      const qualifyingDates = new Set(
        athlete.activities
          .filter((activity) => Challenge.toOurActivity(activity.type) === ActivityType.OnFoot && activity.distance >= STREAK_MIN_DISTANCE_M)
          .map((activity) => activity.start_date_local.slice(0, 10)),
      );

      const pendingDates = challengeDates.filter((date) => !previous.lastEvaluatedDate || date > previous.lastEvaluatedDate);
      if (pendingDates.length === 0) return { ...previous, name };

      let { currentStreak, longestStreak } = previous;
      for (const date of pendingDates) {
        currentStreak = qualifyingDates.has(date) ? currentStreak + 1 : 0;
        longestStreak = Math.max(longestStreak, currentStreak);
      }

      return { athleteId: athlete.id, name, currentStreak, longestStreak, lastEvaluatedDate: pendingDates[pendingDates.length - 1] };
    });
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

  // Distance to 0.1km, pace (in decimal minutes) to whole seconds - the website shows it as min:sec - and duration
  // and elevation to whole minutes/metres.
  // TODO(2027): store pace as whole seconds per km - then this is a plain Math.round and the website formats seconds
  // directly. The results data is cleared after each challenge, so there's no old format to keep supporting.
  private static roundTotal(total: number, type: GroupingType): number {
    if (type === GroupingType.Distance) return Math.round(total * 10) / 10;
    if (type === GroupingType.Pace) return Math.round(total * 60) / 60;
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
