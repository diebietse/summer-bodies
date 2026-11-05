// Run with: npm test
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  toStoredActivity,
  mergeIntoAthletesWithActivities,
  isDeauthorizationEvent,
  shouldSkipStaleWrite,
  staleStoredActivityIds,
  isWebhookEvent,
  secretsMatch,
  webhookLivenessProblems,
  webhookPostResponse,
  webhookVerificationResponse,
  isLivenessCheckTime,
  missedStoredActivities,
  storedActivityChanged,
  changedStoredActivities,
} from "./activityLogic";
import { Athlete, AthleteWithActivities, StoredActivity, Activity } from "./challenge-models";
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
    start_date_local: "2026-10-05T08:00:00Z",
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

test("toStoredActivity keeps only the scored fields, dropping the rest of a detailed activity", () => {
  const detailed = { ...activity({ sport_type: "TrailRun" }), map: { polyline: "abc" }, segment_efforts: [{}], description: "Hi" } as Activity;

  const result = toStoredActivity(detailed, "7", 123);

  assert.deepEqual(Object.keys(result).sort(), [
    "athleteId",
    "average_speed",
    "distance",
    "elapsed_time",
    "id",
    "lastEventTime",
    "moving_time",
    "name",
    "sport_type",
    "startDateUnix",
    "start_date",
    "start_date_local",
    "total_elevation_gain",
    "type",
  ]);
});

test("toStoredActivity leaves out sport_type when Strava didn't send one, since Firestore rejects undefined", () => {
  assert.equal("sport_type" in toStoredActivity(activity(), "7", 123), false);
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

function polled(id: string, activityIds: number[]): AthleteWithActivities {
  return { ...athlete(id), activities: activityIds.map((activityId) => activity({ id: activityId })) };
}

test("staleStoredActivityIds returns stored activities a successfully polled athlete no longer has", () => {
  const storedActivities = [stored({ id: 1, athleteId: "1" }), stored({ id: 2, athleteId: "1" })];

  assert.deepEqual(staleStoredActivityIds(storedActivities, [polled("1", [1])]), [2]);
});

test("staleStoredActivityIds leaves alone the activities of an athlete whose poll failed", () => {
  const storedActivities = [stored({ id: 1, athleteId: "1" }), stored({ id: 2, athleteId: "2" })];

  assert.deepEqual(staleStoredActivityIds(storedActivities, [polled("1", [1])]), []);
});

test("staleStoredActivityIds is empty when the store matches the poll", () => {
  assert.deepEqual(staleStoredActivityIds([stored({ id: 1, athleteId: "1" })], [polled("1", [1, 3])]), []);
});

test("isWebhookEvent accepts Strava's event shapes", () => {
  assert.equal(isWebhookEvent(webhookEvent()), true);
  assert.equal(isWebhookEvent(webhookEvent({ object_type: "activity", aspect_type: "create" })), true);
  assert.equal(isWebhookEvent(webhookEvent({ updates: { authorized: "false" } })), true);
});

test("isWebhookEvent rejects junk", () => {
  for (const body of [
    null,
    "event",
    {},
    { ...webhookEvent(), owner_id: "1" },
    { ...webhookEvent(), object_type: "club" },
    { ...webhookEvent(), event_time: undefined },
  ]) {
    assert.equal(isWebhookEvent(body), false, JSON.stringify(body));
  }
});

test("secretsMatch only matches the same, set secret", () => {
  assert.equal(secretsMatch("abc123", "abc123"), true);
  assert.equal(secretsMatch("abc124", "abc123"), false);
  assert.equal(secretsMatch("abc", "abc123"), false);
  assert.equal(secretsMatch("", ""), false);
  assert.equal(secretsMatch("abc123", undefined), false);
});

function liveness(overrides: Partial<Parameters<typeof webhookLivenessProblems>[0]> = {}) {
  return webhookLivenessProblems({
    subscriptionIds: [5],
    configuredSubscriptionId: 5,
    lastEventAt: 1000,
    now: 1000 + 3600,
    maxSilenceSeconds: 86400,
    ...overrides,
  });
}

test("webhookLivenessProblems is happy with the configured subscription and a recent event", () => {
  assert.deepEqual(liveness(), []);
});

test("webhookLivenessProblems reports a missing or different subscription", () => {
  assert.match(liveness({ subscriptionIds: [] }).join(), /no subscription, not the configured 5/);
  assert.match(liveness({ subscriptionIds: [6] }).join(), /subscription 6, not the configured 5/);
  assert.match(liveness({ configuredSubscriptionId: undefined }).join(), /No subscription is configured/);
});

test("webhookLivenessProblems reports a day without events", () => {
  assert.deepEqual(liveness({ now: 1000 + 86400 + 7200 }), ["No webhook event for 26 hours"]);
  assert.deepEqual(liveness({ lastEventAt: undefined }), ["No webhook event has ever arrived"]);
});

const ROUTE_CONFIG = { stravaWebhookPathSecret: "secret", stravaWebhookVerifyToken: "verify", stravaWebhookSubscriptionId: 5 };

test("webhookVerificationResponse echoes the challenge only for the right path secret and verify token", () => {
  const query = { "hub.mode": "subscribe", "hub.verify_token": "verify", "hub.challenge": "abc" };

  assert.deepEqual(webhookVerificationResponse("secret", query, ROUTE_CONFIG), { status: 200, body: { "hub.challenge": "abc" } });
  assert.equal(webhookVerificationResponse("wrong", query, ROUTE_CONFIG).status, 404);
  assert.equal(webhookVerificationResponse("secret", { ...query, "hub.verify_token": "nope" }, ROUTE_CONFIG).status, 403);
});

test("webhookPostResponse queues a valid event for our subscription", () => {
  const event = webhookEvent({ subscription_id: 5 });

  assert.deepEqual(webhookPostResponse("secret", event, ROUTE_CONFIG), { status: 200, body: {}, queue: event });
});

test("webhookPostResponse turns away a wrong secret (404) and a malformed body (400), queueing neither", () => {
  const wrongSecret = webhookPostResponse("wrong", webhookEvent({ subscription_id: 5 }), ROUTE_CONFIG);
  const malformed = webhookPostResponse("secret", { hello: "world" }, ROUTE_CONFIG);

  assert.equal(wrongSecret.status, 404);
  assert.equal(malformed.status, 400);
  assert.equal(wrongSecret.queue ?? malformed.queue, undefined);
});

test("webhookPostResponse acknowledges but drops an event for another subscription, logging whose it was", () => {
  const response = webhookPostResponse("secret", webhookEvent({ subscription_id: 6, owner_id: 4242 }), ROUTE_CONFIG);

  assert.equal(response.status, 200);
  assert.equal(response.queue, undefined);
  assert.match(response.warning ?? "", /subscription 6: athlete update of athlete 4242/);
});

test("isLivenessCheckTime covers the challenge's days and the day after, in SAST", () => {
  const sast = (iso: string) => Date.parse(`${iso}+02:00`) / 1000;
  const [start, end] = ["2027-10-04", "2027-10-31"];

  assert.equal(isLivenessCheckTime(sast("2027-10-03T23:59:59"), start, end), false);
  assert.equal(isLivenessCheckTime(sast("2027-10-04T00:00:00"), start, end), true);
  assert.equal(isLivenessCheckTime(sast("2027-11-01T09:00:00"), start, end), true);
  assert.equal(isLivenessCheckTime(sast("2027-11-02T00:00:00"), start, end), false);
});

test("missedStoredActivities lists the polled activities the store doesn't have", () => {
  const missed = missedStoredActivities([stored({ id: 1, athleteId: "1" })], [polled("1", [1, 2])]);

  assert.deepEqual(missed, [{ athleteName: "Test 1", activityId: 2, startDate: "2026-10-05T06:00:00Z" }]);
});

test("storedActivityChanged spots an edit to any stored field, and nothing else", () => {
  const live = activity({ id: 5, distance: 1474.7, elapsed_time: 3750 });
  const storedCopy = toStoredActivity(live, "1", 100);

  assert.equal(storedActivityChanged(storedCopy, live), false);
  assert.equal(storedActivityChanged(storedCopy, { ...live, distance: 5105.5 }), true);
  assert.equal(storedActivityChanged(storedCopy, { ...live, sport_type: "Tennis" }), true);
});

test("storedActivityChanged treats a copy stored with extra fields (older code kept the whole activity) as changed", () => {
  const live = activity({ id: 5 });
  const bloated = { ...toStoredActivity(live, "1", 100), map: { polyline: "abc" } } as StoredActivity;

  assert.equal(storedActivityChanged(bloated, live), true);
});

test("changedStoredActivities lists polled activities whose stored copy is out of date", () => {
  const storedActivities = [toStoredActivity(activity({ id: 1 }), "1", 0), toStoredActivity(activity({ id: 2, distance: 5000 }), "1", 0)];
  const polledAthlete = { ...athlete("1"), activities: [activity({ id: 1 }), activity({ id: 2, distance: 1500 }), activity({ id: 3 })] };

  assert.deepEqual(changedStoredActivities(storedActivities, [polledAthlete]), [2]);
});
