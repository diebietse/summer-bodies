// Run with: npm test
import { test } from "node:test";
import assert from "node:assert/strict";

import { toStoredActivity, mergeIntoAthletesWithActivities, isDeauthorizationEvent, shouldSkipStaleWrite } from "./activityLogic";
import { Athlete, StoredActivity, Activity } from "./challenge-models";
import { StravaWebhookEvent } from "./strava";

function athlete(id: string): Athlete {
  return { id, firstname: "Test", lastname: id, profile: "", refreshToken: "" };
}

function activity(overrides: Partial<Activity> = {}): Activity {
  return {
    id: 1,
    name: "Activity",
    distance: 0,
    moving_time: 0,
    elapsed_time: 0,
    total_elevation_gain: 0,
    average_speed: 0,
    type: "Run",
    start_date: "2026-10-05T06:00:00Z",
    ...overrides,
  };
}

function stored(overrides: Partial<StoredActivity> = {}): StoredActivity {
  return { ...activity(), athleteId: "1", startDateUnix: 0, lastEventTime: 0, ...overrides };
}

test("toStoredActivity derives startDateUnix from start_date and attaches athleteId/lastEventTime", () => {
  const result = toStoredActivity(activity({ id: 42, start_date: "2026-10-05T06:00:00Z" }), "7", 123);

  assert.equal(result.id, 42);
  assert.equal(result.athleteId, "7");
  assert.equal(result.lastEventTime, 123);
  assert.equal(result.startDateUnix, Math.floor(new Date("2026-10-05T06:00:00Z").getTime() / 1000));
});

test("mergeIntoAthletesWithActivities gives a registered athlete with no stored activities an empty list", () => {
  const [result] = mergeIntoAthletesWithActivities([athlete("1")], []);

  assert.deepEqual(result.activities, []);
});

test("mergeIntoAthletesWithActivities excludes an activity belonging to an unregistered athlete", () => {
  const storedActivities = [stored({ id: 1, athleteId: "1" }), stored({ id: 2, athleteId: "removed-athlete" })];

  const result = mergeIntoAthletesWithActivities([athlete("1")], storedActivities);

  assert.equal(result.length, 1);
  assert.deepEqual(
    result[0].activities.map((a) => a.id),
    [1],
  );
});

test("mergeIntoAthletesWithActivities groups multiple activities under the same athlete", () => {
  const storedActivities = [stored({ id: 1, athleteId: "1" }), stored({ id: 2, athleteId: "1" }), stored({ id: 3, athleteId: "2" })];

  const result = mergeIntoAthletesWithActivities([athlete("1"), athlete("2")], storedActivities);

  assert.deepEqual(
    result.find((a) => a.id === "1")?.activities.map((a) => a.id),
    [1, 2],
  );
  assert.deepEqual(
    result.find((a) => a.id === "2")?.activities.map((a) => a.id),
    [3],
  );
});

function webhookEvent(overrides: Partial<StravaWebhookEvent> = {}): StravaWebhookEvent {
  return {
    object_type: "athlete",
    object_id: 1,
    aspect_type: "update",
    owner_id: 1,
    subscription_id: 1,
    event_time: 0,
    ...overrides,
  };
}

test("isDeauthorizationEvent is true for an athlete update with authorized: false", () => {
  assert.equal(isDeauthorizationEvent(webhookEvent({ updates: { authorized: "false" } })), true);
});

test("isDeauthorizationEvent is false for an athlete update without the authorized field", () => {
  assert.equal(isDeauthorizationEvent(webhookEvent({ updates: { title: "Messy" } })), false);
});

test("isDeauthorizationEvent is false for an activity event, even with authorized: false in updates", () => {
  assert.equal(isDeauthorizationEvent(webhookEvent({ object_type: "activity", updates: { authorized: "false" } })), false);
});

test("isDeauthorizationEvent is false for an athlete create event", () => {
  assert.equal(isDeauthorizationEvent(webhookEvent({ aspect_type: "create", updates: { authorized: "false" } })), false);
});

test("shouldSkipStaleWrite is false when nothing is stored yet", () => {
  assert.equal(shouldSkipStaleWrite(undefined, 100), false);
});

test("shouldSkipStaleWrite is true when the stored write is newer than the incoming one", () => {
  assert.equal(shouldSkipStaleWrite(200, 100), true);
});

test("shouldSkipStaleWrite is false when the incoming write is newer than or equal to what's stored", () => {
  assert.equal(shouldSkipStaleWrite(100, 200), false);
  assert.equal(shouldSkipStaleWrite(100, 100), false);
});
