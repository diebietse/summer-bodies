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

  assert.equal(result.alive, true);
  assert.equal(result.currentStreak, 1);
});

test("an activity counts toward the athlete's local day, not the UTC day", () => {
  // 00:30 SAST on the 6th is 22:30 UTC on the 5th
  const athletes = [athlete("1", [{ type: "Run", distance: 1200, start_date: "2026-10-05T22:30:00Z", start_date_local: "2026-10-06T00:30:00Z" }])];
  const [result] = Challenge.calculateStreakUpdates(athletes, new Map(), ["2026-10-06"]);

  assert.equal(result.alive, true);
  assert.equal(result.currentStreak, 1);
});

test("an activity under 1km does not qualify", () => {
  const athletes = [athlete("1", [{ type: "Run", distance: 900, start_date_local: "2026-10-05T06:00:00Z" }])];
  const [result] = Challenge.calculateStreakUpdates(athletes, new Map(), ["2026-10-05"]);

  assert.equal(result.alive, false);
  assert.equal(result.currentStreak, 0);
});

test("an activity of exactly 1km qualifies", () => {
  const athletes = [athlete("1", [{ type: "Walk", distance: 1000, start_date_local: "2026-10-05T06:00:00Z" }])];
  const [result] = Challenge.calculateStreakUpdates(athletes, new Map(), ["2026-10-05"]);

  assert.equal(result.alive, true);
  assert.equal(result.currentStreak, 1);
});

test("a non on-foot activity does not qualify, even if it's far enough", () => {
  const athletes = [athlete("1", [{ type: "Ride", distance: 5000, start_date_local: "2026-10-05T06:00:00Z" }])];
  const [result] = Challenge.calculateStreakUpdates(athletes, new Map(), ["2026-10-05"]);

  assert.equal(result.alive, false);
  assert.equal(result.currentStreak, 0);
});

test("only one qualifying activity on the day is enough", () => {
  const athletes = [
    athlete("1", [
      { type: "Run", distance: 500, start_date_local: "2026-10-05T06:00:00Z" },
      { type: "Hike", distance: 2000, start_date_local: "2026-10-05T17:00:00Z" },
    ]),
  ];
  const [result] = Challenge.calculateStreakUpdates(athletes, new Map(), ["2026-10-05"]);

  assert.equal(result.alive, true);
  assert.equal(result.currentStreak, 1);
});

test("an activity only counts for its own calendar day", () => {
  // Qualifying activity on the 6th, but the 5th - the first day being checked - has nothing.
  const athletes = [athlete("1", [{ type: "Run", distance: 2000, start_date_local: "2026-10-06T06:00:00Z" }])];
  const [result] = Challenge.calculateStreakUpdates(athletes, new Map(), ["2026-10-05", "2026-10-06"]);

  assert.equal(result.alive, false);
  assert.equal(result.currentStreak, 0);
});

test("consecutive qualifying days extend an existing streak", () => {
  const athletes = [
    athlete("1", [
      { type: "Run", distance: 1500, start_date_local: "2026-10-12T06:00:00Z" },
      { type: "Walk", distance: 1200, start_date_local: "2026-10-13T06:00:00Z" },
    ]),
  ];
  const previousStreaks = new Map<string, StreakState>([["1", { athleteId: "1", name: "Test 1", alive: true, currentStreak: 3 }]]);
  const [result] = Challenge.calculateStreakUpdates(athletes, previousStreaks, ["2026-10-12", "2026-10-13"]);

  assert.equal(result.alive, true);
  assert.equal(result.currentStreak, 5);
});

test("a missed day eliminates the athlete and freezes their streak at the days completed so far in this check", () => {
  const athletes = [athlete("1", [{ type: "Run", distance: 1500, start_date_local: "2026-10-12T06:00:00Z" }])];
  const previousStreaks = new Map<string, StreakState>([["1", { athleteId: "1", name: "Test 1", alive: true, currentStreak: 6 }]]);
  // The 12th qualifies (streak -> 7), the 13th has nothing recorded, so they're eliminated with the streak frozen at 7.
  const [result] = Challenge.calculateStreakUpdates(athletes, previousStreaks, ["2026-10-12", "2026-10-13"]);

  assert.equal(result.alive, false);
  assert.equal(result.currentStreak, 7);
});

test("an already eliminated athlete stays eliminated, even if they log a qualifying activity", () => {
  const athletes = [athlete("1", [{ type: "Run", distance: 5000, start_date_local: "2026-10-12T06:00:00Z" }])];
  const previousStreaks = new Map<string, StreakState>([["1", { athleteId: "1", name: "Test 1", alive: false, currentStreak: 6 }]]);
  const [result] = Challenge.calculateStreakUpdates(athletes, previousStreaks, ["2026-10-12"]);

  assert.equal(result.alive, false);
  assert.equal(result.currentStreak, 6);
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
  assert.equal(again[0].alive, true);
});

test("an athlete registering after the first week can't start a streak, even with a qualifying run", () => {
  const athletes = [
    athlete("1", [{ type: "Run", distance: 1200, start_date_local: "2026-10-12T06:00:00Z" }]),
    athlete("2", [{ type: "Run", distance: 1200, start_date_local: "2026-10-12T06:00:00Z" }]),
  ];
  const previousStreaks = new Map<string, StreakState>([
    ["1", { athleteId: "1", name: "Test 1", alive: true, currentStreak: 7, lastEvaluatedDate: "2026-10-11" }],
  ]);
  const [, late] = Challenge.calculateStreakUpdates(athletes, previousStreaks, ["2026-10-12"]);

  assert.equal(late.alive, false);
  assert.equal(late.currentStreak, 0);
});

test("if no week has been stored yet, every athlete can still start a streak", () => {
  // e.g. the first week's job failed - nobody is treated as a late starter.
  const athletes = [athlete("1", [{ type: "Run", distance: 1200, start_date_local: "2026-10-12T06:00:00Z" }])];
  const [result] = Challenge.calculateStreakUpdates(athletes, new Map(), ["2026-10-12"]);

  assert.equal(result.alive, true);
  assert.equal(result.currentStreak, 1);
});

test("only dates after the last evaluated one are counted", () => {
  const athletes = [athlete("1", [{ type: "Run", distance: 1200, start_date_local: "2026-10-07T06:00:00Z" }])];
  const previousStreaks = new Map<string, StreakState>([
    ["1", { athleteId: "1", name: "Test 1", alive: true, currentStreak: 2, lastEvaluatedDate: "2026-10-06" }],
  ]);
  const [result] = Challenge.calculateStreakUpdates(athletes, previousStreaks, ["2026-10-06", "2026-10-07"]);

  assert.equal(result.currentStreak, 3);
  assert.equal(result.lastEvaluatedDate, "2026-10-07");
});

test("combineFitcoin sums per contestant and sorts highest first", () => {
  const combined = Challenge.combineFitcoin(
    [
      { name: "A", fitcoin: 10 },
      { name: "B", fitcoin: 30 },
    ],
    [
      { name: "A", fitcoin: 7 },
      { name: "C", fitcoin: 7 },
    ],
  );

  assert.deepEqual(combined, [
    { name: "B", fitcoin: 30 },
    { name: "A", fitcoin: 17 },
    { name: "C", fitcoin: 7 },
  ]);
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
