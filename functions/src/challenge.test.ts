// Run with: npm test
import { test } from "node:test";
import assert from "node:assert/strict";

import { Challenge } from "./challenge";
import { ActivityType, AthleteWithActivities, GroupingType, StreakState, Activity } from "./challenge-models";

function athlete(id: string, activities: Partial<Activity>[]): AthleteWithActivities {
  return {
    id,
    firstname: "Test",
    lastname: id,
    profile: "",
    refreshToken: "",
    activities: activities.map((activity, index) => ({
      id: index,
      name: "Activity",
      distance: 0,
      moving_time: 0,
      elapsed_time: 0,
      total_elevation_gain: 0,
      average_speed: 0,
      type: "Run",
      start_date: "2026-10-05T06:00:00Z",
      start_date_local: "2026-10-05T06:00:00Z",
      ...activity,
    })),
  };
}

test("new athlete who logs a qualifying run on the checked day starts a streak", () => {
  const athletes = [athlete("1", [{ type: "Run", distance: 1200, start_date_local: "2026-10-05T06:00:00Z" }])];
  const [result] = Challenge.calculateStreakUpdates(athletes, new Map(), ["2026-10-05"]);

  assert.equal(result.currentStreak, 1);
  assert.equal(result.longestStreak, 1);
});

test("an activity counts toward the athlete's local day, not the UTC day", () => {
  // 00:30 SAST on the 6th is 22:30 UTC on the 5th
  const athletes = [athlete("1", [{ type: "Run", distance: 1200, start_date: "2026-10-05T22:30:00Z", start_date_local: "2026-10-06T00:30:00Z" }])];
  const [result] = Challenge.calculateStreakUpdates(athletes, new Map(), ["2026-10-06"]);

  assert.equal(result.currentStreak, 1);
  assert.equal(result.longestStreak, 1);
});

test("an activity under 1km does not qualify", () => {
  const athletes = [athlete("1", [{ type: "Run", distance: 900, start_date_local: "2026-10-05T06:00:00Z" }])];
  const [result] = Challenge.calculateStreakUpdates(athletes, new Map(), ["2026-10-05"]);

  assert.equal(result.currentStreak, 0);
  assert.equal(result.longestStreak, 0);
});

test("an activity of exactly 1km qualifies", () => {
  const athletes = [athlete("1", [{ type: "Walk", distance: 1000, start_date_local: "2026-10-05T06:00:00Z" }])];
  const [result] = Challenge.calculateStreakUpdates(athletes, new Map(), ["2026-10-05"]);

  assert.equal(result.currentStreak, 1);
  assert.equal(result.longestStreak, 1);
});

test("a non on-foot activity does not qualify, even if it's far enough", () => {
  const athletes = [athlete("1", [{ type: "Ride", distance: 5000, start_date_local: "2026-10-05T06:00:00Z" }])];
  const [result] = Challenge.calculateStreakUpdates(athletes, new Map(), ["2026-10-05"]);

  assert.equal(result.currentStreak, 0);
  assert.equal(result.longestStreak, 0);
});

test("only one qualifying activity on the day is enough", () => {
  const athletes = [
    athlete("1", [
      { type: "Run", distance: 500, start_date_local: "2026-10-05T06:00:00Z" },
      { type: "Hike", distance: 2000, start_date_local: "2026-10-05T17:00:00Z" },
    ]),
  ];
  const [result] = Challenge.calculateStreakUpdates(athletes, new Map(), ["2026-10-05"]);

  assert.equal(result.currentStreak, 1);
  assert.equal(result.longestStreak, 1);
});

test("an activity only counts for its own calendar day", () => {
  // Qualifying activity on the 6th, but the 5th has nothing - so the streak only starts on the 6th.
  const athletes = [athlete("1", [{ type: "Run", distance: 2000, start_date_local: "2026-10-06T06:00:00Z" }])];
  const [result] = Challenge.calculateStreakUpdates(athletes, new Map(), ["2026-10-05", "2026-10-06", "2026-10-07"]);

  assert.equal(result.currentStreak, 0);
  assert.equal(result.longestStreak, 1);
});

test("consecutive qualifying days extend an existing streak", () => {
  const athletes = [
    athlete("1", [
      { type: "Run", distance: 1500, start_date_local: "2026-10-12T06:00:00Z" },
      { type: "Walk", distance: 1200, start_date_local: "2026-10-13T06:00:00Z" },
    ]),
  ];
  const previousStreaks = new Map<string, StreakState>([["1", { athleteId: "1", name: "Test 1", currentStreak: 3, longestStreak: 3 }]]);
  const [result] = Challenge.calculateStreakUpdates(athletes, previousStreaks, ["2026-10-12", "2026-10-13"]);

  assert.equal(result.currentStreak, 5);
  assert.equal(result.longestStreak, 5);
});

test("a missed day resets the current streak but keeps the longest one", () => {
  const athletes = [athlete("1", [{ type: "Run", distance: 1500, start_date_local: "2026-10-12T06:00:00Z" }])];
  const previousStreaks = new Map<string, StreakState>([["1", { athleteId: "1", name: "Test 1", currentStreak: 6, longestStreak: 6 }]]);
  // The 12th qualifies (streak -> 7), the 13th has nothing recorded, so the current streak starts over.
  const [result] = Challenge.calculateStreakUpdates(athletes, previousStreaks, ["2026-10-12", "2026-10-13"]);

  assert.equal(result.currentStreak, 0);
  assert.equal(result.longestStreak, 7);
});

test("after a missed day a new streak starts, and only becomes the longest once it's longer", () => {
  const athletes = [
    athlete("1", [
      { type: "Run", distance: 5000, start_date_local: "2026-10-12T06:00:00Z" },
      { type: "Run", distance: 5000, start_date_local: "2026-10-13T06:00:00Z" },
      { type: "Run", distance: 5000, start_date_local: "2026-10-14T06:00:00Z" },
    ]),
  ];
  const previousStreaks = new Map<string, StreakState>([["1", { athleteId: "1", name: "Test 1", currentStreak: 0, longestStreak: 2 }]]);

  const [afterTwo] = Challenge.calculateStreakUpdates(athletes, previousStreaks, ["2026-10-12", "2026-10-13"]);
  assert.equal(afterTwo.currentStreak, 2);
  assert.equal(afterTwo.longestStreak, 2);

  const [afterThree] = Challenge.calculateStreakUpdates(athletes, previousStreaks, ["2026-10-12", "2026-10-13", "2026-10-14"]);
  assert.equal(afterThree.currentStreak, 3);
  assert.equal(afterThree.longestStreak, 3);
});

test("Mile Challenge is omitted when nobody logged a mile-range run, like On Wheels is when nobody rode", () => {
  const athletes = [athlete("1", [{ type: "Run", distance: 5000, start_date_local: "2026-10-05T06:00:00Z" }])];
  const { topResults } = Challenge.calculateResults(athletes);

  assert.equal(
    topResults.some((event) => event.name === ActivityType.MileChallenge),
    false,
  );
  assert.equal(
    topResults.some((event) => event.name === ActivityType.OnWheels),
    false,
  );
});

test("Mile Challenge is included once someone logs a mile-range run", () => {
  const athletes = [athlete("1", [{ type: "Run", distance: 1600, start_date_local: "2026-10-05T06:00:00Z" }])];
  const { topResults } = Challenge.calculateResults(athletes);

  assert.equal(
    topResults.some((event) => event.name === ActivityType.MileChallenge),
    true,
  );
});

test("distance adds up the exact distances and rounds only the total, to 0.1km", () => {
  const walks = [1, 2, 3, 4, 5].map((day) => ({ type: "Walk", distance: 1400, start_date_local: `2026-10-0${day}T06:00:00Z` }));
  const athletes = [athlete("1", [...walks, { type: "Walk", distance: 400, start_date_local: "2026-10-06T06:00:00Z" }])];
  const { topResults } = Challenge.calculateResults(athletes);

  const distance = topResults
    .find((event) => event.name === ActivityType.OnFoot)
    ?.groupings.find((grouping) => grouping.name === GroupingType.Distance);

  // Rounding each walk first gave 5 x 1km + 0km = 5km.
  assert.equal(distance?.contestants[0].total, 7.4);
});

test("athletes whose distances round to the same total tie and share FitCoin", () => {
  const athletes = [
    athlete("1", [{ type: "Run", distance: 10040, start_date_local: "2026-10-05T06:00:00Z" }]),
    athlete("2", [{ type: "Run", distance: 10010, start_date_local: "2026-10-05T06:00:00Z" }]),
  ];
  const { topResults } = Challenge.calculateResults(athletes);

  const [first, second] = topResults
    .find((event) => event.name === ActivityType.OnFoot)!
    .groupings.find((grouping) => grouping.name === GroupingType.Distance)!.contestants;

  assert.equal(first.total, 10);
  assert.equal(second.total, 10);
  assert.equal(first.fitcoin, second.fitcoin);
});

test("athletes tied with the last FitCoin place are all kept, not cut off", () => {
  // 17 people: 5 tiers of 3, so 15 places earn FitCoin - but places 13 to 17 are tied on 1 attempt.
  const attempts = [6, 3, 3, 3, 3, 3, 3, 2, 2, 2, 2, 2, 1, 1, 1, 1, 1];
  const athletes = attempts.map((count, i) =>
    athlete(
      String(i + 1),
      Array.from({ length: count }, () => ({ type: "Walk", distance: 1700, start_date_local: "2026-10-05T06:00:00Z" })),
    ),
  );
  const { topResults } = Challenge.calculateResults(athletes);

  const contestants = topResults
    .find((event) => event.name === ActivityType.MileChallenge)!
    .groupings.find((grouping) => grouping.name === GroupingType.Attempts)!.contestants;

  assert.equal(contestants.length, 17);
  assert.deepEqual(
    contestants.slice(12).map((c) => c.fitcoin),
    [1, 1, 1, 1, 1],
  );
});

test("Other pays double per tier, from 20 down to 2", () => {
  const athletes = Array.from({ length: 10 }, (_, i) =>
    athlete(String(i + 1), [{ type: "Yoga", moving_time: (60 - i) * 60, elapsed_time: (60 - i) * 60, start_date_local: "2026-10-05T06:00:00Z" }]),
  );
  const other = Challenge.calculateResults(athletes).topResults.find((event) => event.name === ActivityType.Other)!;

  assert.deepEqual(
    other.groupings[0].contestants.map((c) => c.fitcoin),
    [20, 18, 16, 14, 12, 10, 8, 6, 4, 2],
  );
});

function otherAthletes(minutes: number[]): AthleteWithActivities[] {
  return minutes.map((m, i) =>
    athlete(String(i + 1), [{ type: "Yoga", moving_time: m * 60, elapsed_time: m * 60, start_date_local: "2026-10-05T06:00:00Z" }]),
  );
}

function otherFitcoin(athletes: AthleteWithActivities[]): number[] {
  return Challenge.calculateResults(athletes)
    .topResults.find((event) => event.name === ActivityType.Other)!
    .groupings[0].contestants.map((c) => c.fitcoin);
}

test("tied Other entrants share the doubled FitCoin", () => {
  assert.deepEqual(otherFitcoin(otherAthletes([60, 50, 50, 40])), [8, 6, 6, 2]);
});

test("with more than 10 Other entrants several share each doubled tier", () => {
  const fitcoin = otherFitcoin(otherAthletes(Array.from({ length: 25 }, (_, i) => 100 - i)));

  assert.deepEqual(fitcoin, [20, 20, 18, 18, 16, 16, 14, 14, 12, 12, 10, 10, 8, 8, 6, 6, 4, 4, 2, 2]);
});

test("someone tied with the last paid Other place gets the same doubled FitCoin", () => {
  const fitcoin = otherFitcoin(otherAthletes([60, 59, 58, 57, 56, 55, 54, 53, 52, 51, 51]));

  assert.deepEqual(fitcoin.slice(-2), [2, 2]);
});

function streak(name: string, currentStreak: number, longestStreak: number): StreakState {
  return { athleteId: name, name, currentStreak, longestStreak };
}

test("calculateStreakFitcoin pays each longest streak, but only in the week containing the challenge's last day", () => {
  const streaks = [streak("Alex", 0, 12), streak("Blake", 28, 28), streak("Casey", 0, 0)];
  const finalWeek = ["2026-10-26", "2026-10-27", "2026-10-28", "2026-10-29", "2026-10-30", "2026-10-31", "2026-11-01"];

  assert.deepEqual(Challenge.calculateStreakFitcoin(streaks, finalWeek, "2026-11-01"), [
    { name: "Blake", fitcoin: 28 },
    { name: "Alex", fitcoin: 12 },
  ]);
  assert.deepEqual(Challenge.calculateStreakFitcoin(streaks, ["2026-10-19", "2026-10-25"], "2026-11-01"), []);
});

test("withStreakDefaults fills in what docs from older code lack", () => {
  const old = { athleteId: "1", name: "Alex", currentStreak: 9 } as StreakState;

  assert.deepEqual(Challenge.withStreakDefaults(old, "2026-10-18"), { ...old, longestStreak: 9, lastEvaluatedDate: "2026-10-18" });
});

test("withStreakDefaults ends the current streak of an athlete older code eliminated, keeping it as their longest", () => {
  const eliminated = { athleteId: "1", name: "Alex", currentStreak: 15, alive: false, lastEvaluatedDate: "2026-10-25" } as StreakState & {
    alive: boolean;
  };

  assert.deepEqual(Challenge.withStreakDefaults(eliminated, "2026-10-25"), {
    athleteId: "1",
    name: "Alex",
    currentStreak: 0,
    longestStreak: 15,
    lastEvaluatedDate: "2026-10-25",
  });
});

test("withStreakDefaults leaves a current doc unchanged", () => {
  const current = { athleteId: "1", name: "Alex", currentStreak: 3, longestStreak: 10, lastEvaluatedDate: "2026-10-25" };

  assert.deepEqual(Challenge.withStreakDefaults(current, "2026-11-01"), current);
});

test("mile paces that round to the same second tie and share FitCoin", () => {
  // 1.6km in 369.6s and 369.9s: 3:51.00 and 3:51.19 per km, both shown as 3:51.
  const athletes = [
    athlete("1", [{ type: "Run", distance: 1600, elapsed_time: 369.6, start_date_local: "2026-10-05T06:00:00Z" }]),
    athlete("2", [{ type: "Run", distance: 1600, elapsed_time: 369.9, start_date_local: "2026-10-05T06:00:00Z" }]),
  ];
  const { topResults } = Challenge.calculateResults(athletes);

  const [first, second] = topResults
    .find((event) => event.name === ActivityType.MileChallenge)!
    .groupings.find((grouping) => grouping.name === GroupingType.Pace)!.contestants;

  assert.equal(first.total * 60, 231);
  assert.equal(second.total * 60, 231);
  assert.equal(first.fitcoin, second.fitcoin);
});

test("Mile Challenge includes both ends of the 1.5-2km range", () => {
  const athletes = [
    athlete("1", [
      { type: "Run", distance: 1500, start_date_local: "2026-10-05T06:00:00Z" },
      { type: "Walk", distance: 2000, start_date_local: "2026-10-06T06:00:00Z" },
      { type: "Run", distance: 1499, start_date_local: "2026-10-07T06:00:00Z" },
      { type: "Run", distance: 2001, start_date_local: "2026-10-08T06:00:00Z" },
    ]),
  ];
  const { topResults } = Challenge.calculateResults(athletes);

  const attempts = topResults
    .find((event) => event.name === ActivityType.MileChallenge)
    ?.groupings.find((grouping) => grouping.name === GroupingType.Attempts);

  assert.equal(attempts?.contestants[0].total, 2);
});

test("Other category contestants list the distinct activity types behind their total", () => {
  const athletes = [
    athlete("1", [
      { type: "Yoga", moving_time: 30 * 60, start_date_local: "2026-10-05T06:00:00Z" },
      { type: "Golf", moving_time: 60 * 60, start_date_local: "2026-10-06T06:00:00Z" },
      { type: "Yoga", moving_time: 30 * 60, start_date_local: "2026-10-07T06:00:00Z" },
    ]),
  ];
  const { topResults } = Challenge.calculateResults(athletes);

  const other = topResults.find((event) => event.name === ActivityType.Other);
  const duration = other?.groupings.find((grouping) => grouping.name === GroupingType.Duration);

  assert.deepEqual(duration?.contestants[0].activityTypes, ["Golf", "Yoga"]);
});

test("Other category names a newer sport by its sport_type, not the legacy Workout type", () => {
  const athletes = [athlete("1", [{ type: "Workout", sport_type: "Tennis", moving_time: 60 * 60, start_date_local: "2026-10-05T06:00:00Z" }])];
  const { topResults } = Challenge.calculateResults(athletes);

  const duration = topResults
    .find((event) => event.name === ActivityType.Other)
    ?.groupings.find((grouping) => grouping.name === GroupingType.Duration);

  assert.deepEqual(duration?.contestants[0].activityTypes, ["Tennis"]);
});

test("evaluating the same dates again does not count them twice", () => {
  const athletes = [
    athlete("1", [
      { type: "Run", distance: 1200, start_date_local: "2026-10-05T06:00:00Z" },
      { type: "Run", distance: 1200, start_date_local: "2026-10-06T06:00:00Z" },
    ]),
  ];
  const dates = ["2026-10-05", "2026-10-06"];
  const first = Challenge.calculateStreakUpdates(athletes, new Map(), dates);
  const again = Challenge.calculateStreakUpdates(athletes, new Map(first.map((streak) => [streak.athleteId, streak])), dates);

  assert.equal(first[0].currentStreak, 2);
  assert.equal(again[0].currentStreak, 2);
  assert.equal(again[0].longestStreak, 2);
});

test("an athlete registering after the first week can still start a streak", () => {
  const athletes = [
    athlete("1", [{ type: "Run", distance: 1200, start_date_local: "2026-10-12T06:00:00Z" }]),
    athlete("2", [{ type: "Run", distance: 1200, start_date_local: "2026-10-12T06:00:00Z" }]),
  ];
  const previousStreaks = new Map<string, StreakState>([
    ["1", { athleteId: "1", name: "Test 1", currentStreak: 7, longestStreak: 7, lastEvaluatedDate: "2026-10-11" }],
  ]);
  const [, late] = Challenge.calculateStreakUpdates(athletes, previousStreaks, ["2026-10-12"]);

  assert.equal(late.currentStreak, 1);
  assert.equal(late.longestStreak, 1);
});

test("only dates after the last evaluated one are counted", () => {
  const athletes = [athlete("1", [{ type: "Run", distance: 1200, start_date_local: "2026-10-07T06:00:00Z" }])];
  const previousStreaks = new Map<string, StreakState>([
    ["1", { athleteId: "1", name: "Test 1", currentStreak: 2, longestStreak: 2, lastEvaluatedDate: "2026-10-06" }],
  ]);
  const [result] = Challenge.calculateStreakUpdates(athletes, previousStreaks, ["2026-10-06", "2026-10-07"]);

  assert.equal(result.currentStreak, 3);
  assert.equal(result.lastEvaluatedDate, "2026-10-07");
});

test("of two overlapping activities only the shortest is kept", () => {
  const athletes = [
    athlete("1", [
      { id: 1, name: "Phone", start_date: "2026-10-11T08:20:47Z", elapsed_time: 6624, moving_time: 6624, distance: 6330 },
      { id: 2, name: "Watch", start_date: "2026-10-11T08:23:03Z", elapsed_time: 4518, moving_time: 4356, distance: 4820 },
    ]),
  ];
  const { athletes: result, ignored } = Challenge.removeDuplicateActivities(athletes);

  assert.deepEqual(
    result[0].activities.map((activity) => activity.name),
    ["Watch"],
  );
  assert.equal(ignored.length, 1);
  assert.match(ignored[0].ignored, /^Phone /);
  assert.match(ignored[0].kept, /^Watch /);
});

test("back-to-back and unrelated activities are all kept", () => {
  const athletes = [
    athlete("1", [
      { id: 1, start_date: "2026-10-05T06:00:00Z", elapsed_time: 1800, moving_time: 1800 },
      { id: 2, start_date: "2026-10-05T06:30:00Z", elapsed_time: 1800, moving_time: 1800 },
      { id: 3, start_date: "2026-10-06T06:00:00Z", elapsed_time: 1800, moving_time: 1800 },
    ]),
  ];
  const { athletes: result, ignored } = Challenge.removeDuplicateActivities(athletes);

  assert.equal(result[0].activities.length, 3);
  assert.equal(ignored.length, 0);
});

test("identical duplicates keep exactly one", () => {
  const same = { start_date: "2026-10-05T06:17:00Z", elapsed_time: 3300, moving_time: 3300 };
  const { athletes: result } = Challenge.removeDuplicateActivities([
    athlete("1", [
      { id: 1, ...same },
      { id: 2, ...same },
    ]),
  ]);

  assert.equal(result[0].activities.length, 1);
});

test("a long activity overlapping a kept shorter one is dropped, even when it also overlaps a third", () => {
  const athletes = [
    athlete("1", [
      { id: 1, name: "A", start_date: "2026-10-05T06:00:00Z", elapsed_time: 1800, moving_time: 1800 },
      { id: 2, name: "Long", start_date: "2026-10-05T06:10:00Z", elapsed_time: 3600, moving_time: 3600 },
      { id: 3, name: "C", start_date: "2026-10-05T06:40:00Z", elapsed_time: 1800, moving_time: 1800 },
    ]),
  ];
  const { athletes: result } = Challenge.removeDuplicateActivities(athletes);

  assert.deepEqual(
    result[0].activities.map((activity) => activity.name),
    ["A", "C"],
  );
});

test("overlapping activities from different groups are both kept", () => {
  const athletes = [
    athlete("1", [
      { id: 1, name: "Walk", type: "Walk", distance: 5000, start_date: "2026-10-05T06:00:00Z", elapsed_time: 3600, moving_time: 3600 },
      { id: 2, name: "Workout", type: "Workout", distance: 0, start_date: "2026-10-05T06:20:00Z", elapsed_time: 600, moving_time: 600 },
    ]),
  ];
  const { athletes: result, ignored } = Challenge.removeDuplicateActivities(athletes);

  assert.deepEqual(
    result[0].activities.map((activity) => activity.name),
    ["Walk", "Workout"],
  );
  assert.equal(ignored.length, 0);
});

test("overlap between different athletes is not a duplicate", () => {
  const activity = [{ start_date: "2026-10-05T06:00:00Z", elapsed_time: 1800, moving_time: 1800 }];
  const { athletes: result } = Challenge.removeDuplicateActivities([athlete("1", activity), athlete("2", activity)]);

  assert.equal(result[0].activities.length, 1);
  assert.equal(result[1].activities.length, 1);
});

test("addFitcoin sums each person's FitCoin across lists, highest first", () => {
  assert.deepEqual(
    Challenge.addFitcoin(
      [
        { name: "Alex", fitcoin: 10 },
        { name: "Blake", fitcoin: 4 },
      ],
      [{ name: "Blake", fitcoin: 9 }],
    ),
    [
      { name: "Blake", fitcoin: 13 },
      { name: "Alex", fitcoin: 10 },
    ],
  );
});

test("dailyFitcoin adds this week to the stored total, and last week while it isn't stored yet", () => {
  const stored = [{ name: "Alex", fitcoin: 50 }];
  const week = [{ name: "Alex", fitcoin: 5 }];

  assert.deepEqual(Challenge.dailyFitcoin({ stored, week, weekCounts: true }).total, [{ name: "Alex", fitcoin: 55 }]);
  assert.deepEqual(Challenge.dailyFitcoin({ stored, week, weekCounts: true, unstoredLastWeek: [{ name: "Alex", fitcoin: 30 }] }).total, [
    { name: "Alex", fitcoin: 85 },
  ]);
});

test("dailyFitcoin leaves out a week outside the challenge", () => {
  const result = Challenge.dailyFitcoin({ stored: [{ name: "Alex", fitcoin: 50 }], week: [{ name: "Alex", fitcoin: 5 }], weekCounts: false });

  assert.deepEqual(result, { week: [], total: [{ name: "Alex", fitcoin: 50 }] });
});
