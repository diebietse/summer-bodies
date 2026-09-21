// Run with: npm test
import { test } from "node:test";
import assert from "node:assert/strict";

import { Challenge } from "./challenge";
import { AthleteWithActivities, StreakState, Activity } from "./challenge-models";

function athlete(id: string, activities: Partial<Activity>[]): AthleteWithActivities {
  return {
    id,
    firstname: "Test",
    lastname: id,
    profile: "",
    refreshToken: "",
    club: "All",
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
      ...activity,
    })),
  };
}

test("new athlete who logs a qualifying run on the checked day starts a streak", () => {
  const athletes = [athlete("1", [{ type: "Run", distance: 1200, start_date: "2026-10-05T06:00:00Z" }])];
  const [result] = Challenge.calculateStreakUpdates(athletes, new Map(), ["2026-10-05"]);

  assert.equal(result.alive, true);
  assert.equal(result.currentStreak, 1);
});

test("an activity under 1km does not qualify", () => {
  const athletes = [athlete("1", [{ type: "Run", distance: 900, start_date: "2026-10-05T06:00:00Z" }])];
  const [result] = Challenge.calculateStreakUpdates(athletes, new Map(), ["2026-10-05"]);

  assert.equal(result.alive, false);
  assert.equal(result.currentStreak, 0);
});

test("an activity of exactly 1km qualifies", () => {
  const athletes = [athlete("1", [{ type: "Walk", distance: 1000, start_date: "2026-10-05T06:00:00Z" }])];
  const [result] = Challenge.calculateStreakUpdates(athletes, new Map(), ["2026-10-05"]);

  assert.equal(result.alive, true);
  assert.equal(result.currentStreak, 1);
});

test("a non on-foot activity does not qualify, even if it's far enough", () => {
  const athletes = [athlete("1", [{ type: "Ride", distance: 5000, start_date: "2026-10-05T06:00:00Z" }])];
  const [result] = Challenge.calculateStreakUpdates(athletes, new Map(), ["2026-10-05"]);

  assert.equal(result.alive, false);
  assert.equal(result.currentStreak, 0);
});

test("only one qualifying activity on the day is enough", () => {
  const athletes = [
    athlete("1", [
      { type: "Run", distance: 500, start_date: "2026-10-05T06:00:00Z" },
      { type: "Hike", distance: 2000, start_date: "2026-10-05T17:00:00Z" },
    ]),
  ];
  const [result] = Challenge.calculateStreakUpdates(athletes, new Map(), ["2026-10-05"]);

  assert.equal(result.alive, true);
  assert.equal(result.currentStreak, 1);
});

test("an activity only counts for its own calendar day", () => {
  // Qualifying activity on the 6th, but the 5th - the first day being checked - has nothing.
  const athletes = [athlete("1", [{ type: "Run", distance: 2000, start_date: "2026-10-06T06:00:00Z" }])];
  const [result] = Challenge.calculateStreakUpdates(athletes, new Map(), ["2026-10-05", "2026-10-06"]);

  assert.equal(result.alive, false);
  assert.equal(result.currentStreak, 0);
});

test("consecutive qualifying days extend an existing streak", () => {
  const athletes = [
    athlete("1", [
      { type: "Run", distance: 1500, start_date: "2026-10-12T06:00:00Z" },
      { type: "Walk", distance: 1200, start_date: "2026-10-13T06:00:00Z" },
    ]),
  ];
  const previousStreaks = new Map<string, StreakState>([["1", { athleteId: "1", name: "Test 1", alive: true, currentStreak: 3 }]]);
  const [result] = Challenge.calculateStreakUpdates(athletes, previousStreaks, ["2026-10-12", "2026-10-13"]);

  assert.equal(result.alive, true);
  assert.equal(result.currentStreak, 5);
});

test("a missed day eliminates the athlete and freezes their streak at the days completed so far in this check", () => {
  const athletes = [athlete("1", [{ type: "Run", distance: 1500, start_date: "2026-10-12T06:00:00Z" }])];
  const previousStreaks = new Map<string, StreakState>([["1", { athleteId: "1", name: "Test 1", alive: true, currentStreak: 6 }]]);
  // The 12th qualifies (streak -> 7), the 13th has nothing recorded, so they're eliminated with the streak frozen at 7.
  const [result] = Challenge.calculateStreakUpdates(athletes, previousStreaks, ["2026-10-12", "2026-10-13"]);

  assert.equal(result.alive, false);
  assert.equal(result.currentStreak, 7);
});

test("an already eliminated athlete stays eliminated, even if they log a qualifying activity", () => {
  const athletes = [athlete("1", [{ type: "Run", distance: 5000, start_date: "2026-10-12T06:00:00Z" }])];
  const previousStreaks = new Map<string, StreakState>([["1", { athleteId: "1", name: "Test 1", alive: false, currentStreak: 6 }]]);
  const [result] = Challenge.calculateStreakUpdates(athletes, previousStreaks, ["2026-10-12"]);

  assert.equal(result.alive, false);
  assert.equal(result.currentStreak, 6);
});
