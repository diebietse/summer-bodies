// Run with: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { AxiosError, AxiosHeaders } from "axios";

import {
  handleQueuedWebhookEvent,
  processWebhookEvent,
  QueueDeps,
  QueuedWebhookEvent,
  WEBHOOK_EVENT_GIVE_UP_SECONDS,
  WebhookDeps,
} from "./webhookEvents";
import { Activity, Athlete, StoredActivity } from "./challenge-models";
import { StravaWebhookEvent } from "./strava";

function httpError(status: number): AxiosError {
  const headers = new AxiosHeaders();
  return new AxiosError("Request failed", "ERR_BAD_REQUEST", undefined, undefined, {
    status,
    statusText: "",
    headers,
    config: { headers },
    data: {},
  });
}

const ATHLETE: Athlete = { id: "7", firstname: "Test", lastname: "Athlete", profile: "", refreshToken: "refresh" };

function activity(overrides: Partial<Activity & { athlete: { id: number } }> = {}): Activity & { athlete?: { id: number } } {
  return {
    id: 42,
    name: "Run",
    distance: 5000,
    moving_time: 1500,
    elapsed_time: 1600,
    total_elevation_gain: 20,
    average_speed: 3.3,
    type: "Run",
    start_date: "2027-10-05T06:00:00Z",
    start_date_local: "2027-10-05T08:00:00Z",
    athlete: { id: 7 },
    ...overrides,
  };
}

function event(overrides: Partial<StravaWebhookEvent> = {}): StravaWebhookEvent {
  return { object_type: "activity", object_id: 42, aspect_type: "create", owner_id: 7, subscription_id: 1, event_time: 1000, ...overrides };
}

// Records what the handler changed. Strava's answers default to "the token works and the activity exists".
function fakeDeps(overrides: Partial<WebhookDeps> = {}) {
  const changes = { upserted: [] as StoredActivity[], deleted: [] as number[], removed: [] as string[] };
  const deps: WebhookDeps = {
    getAthlete: async (id) => (id === ATHLETE.id ? ATHLETE : null),
    refreshAccessToken: async () => "access",
    getActivity: async () => activity(),
    upsertActivity: async (stored) => void changes.upserted.push(stored),
    deleteActivity: async (id) => void changes.deleted.push(id),
    removeAthlete: async (id) => void changes.removed.push(id),
    ...overrides,
  };
  return { deps, changes };
}

test("an event for an unregistered athlete changes nothing", async () => {
  const { deps, changes } = fakeDeps();

  await processWebhookEvent(event({ owner_id: 999 }), deps);

  assert.deepEqual(changes, { upserted: [], deleted: [], removed: [] });
});

test("a create stores the activity as Strava returns it, not as the event describes it", async () => {
  const { deps, changes } = fakeDeps({ getActivity: async () => activity({ name: "From Strava" }) });

  await processWebhookEvent(event(), deps);

  assert.equal(changes.upserted.length, 1);
  assert.equal(changes.upserted[0].name, "From Strava");
  assert.equal(changes.upserted[0].athleteId, "7");
  assert.equal(changes.upserted[0].lastEventTime, 1000);
});

test("a delete removes the activity only once Strava no longer shows it", async () => {
  for (const status of [404, 403]) {
    const { deps, changes } = fakeDeps({
      getActivity: async () => {
        throw httpError(status);
      },
    });

    await processWebhookEvent(event({ aspect_type: "delete" }), deps);

    assert.deepEqual(changes.deleted, [42], `status ${status}`);
  }
});

test("a delete for an activity Strava still shows keeps (and refreshes) it instead", async () => {
  const { deps, changes } = fakeDeps();

  await processWebhookEvent(event({ aspect_type: "delete" }), deps);

  assert.deepEqual(changes.deleted, []);
  assert.equal(changes.upserted.length, 1);
});

test("an activity Strava says belongs to someone else isn't stored for the event's owner", async () => {
  const { deps, changes } = fakeDeps({ getActivity: async () => activity({ athlete: { id: 8 } }) });

  await processWebhookEvent(event(), deps);

  assert.deepEqual(changes.upserted, []);
});

test("a deauthorization removes the athlete only once their token is rejected", async () => {
  const deauthorization = event({ object_type: "athlete", object_id: 7, aspect_type: "update", updates: { authorized: "false" } });
  const confirmed = fakeDeps({
    refreshAccessToken: async () => {
      throw httpError(400);
    },
  });
  const forged = fakeDeps();

  await processWebhookEvent(deauthorization, confirmed.deps);
  await processWebhookEvent(deauthorization, forged.deps);

  assert.deepEqual(confirmed.changes.removed, ["7"]);
  assert.deepEqual(forged.changes.removed, []);
});

test("a deauthorization that can't be checked (Strava unavailable) throws, to be retried, and removes no one", async () => {
  const { deps, changes } = fakeDeps({
    refreshAccessToken: async () => {
      throw httpError(503);
    },
  });

  await assert.rejects(processWebhookEvent(event({ object_type: "athlete", aspect_type: "update", updates: { authorized: "false" } }), deps));
  assert.deepEqual(changes.removed, []);
});

test("an activity event whose athlete's token is rejected changes nothing", async () => {
  const { deps, changes } = fakeDeps({
    refreshAccessToken: async () => {
      throw httpError(401);
    },
  });

  await processWebhookEvent(event({ aspect_type: "delete" }), deps);

  assert.deepEqual(changes, { upserted: [], deleted: [], removed: [] });
});

test("an activity event throws, to be retried, when Strava fails for another reason", async () => {
  const { deps } = fakeDeps({
    getActivity: async () => {
      throw httpError(500);
    },
  });

  await assert.rejects(processWebhookEvent(event(), deps));
});

test("an activity event retries when another writer rotated the athlete's refresh token meanwhile", async () => {
  let reads = 0;
  const { deps, changes } = fakeDeps({
    refreshAccessToken: async () => {
      throw httpError(400);
    },
    // The first read is the event's own; the re-check after the rejection finds a newer token.
    getAthlete: async () => (reads++ === 0 ? ATHLETE : { ...ATHLETE, refreshToken: "rotated-by-someone-else" }),
  });

  await assert.rejects(processWebhookEvent(event({ aspect_type: "delete" }), deps), /rotated meanwhile/);
  assert.deepEqual(changes, { upserted: [], deleted: [], removed: [] });
});

test("a deauthorization isn't confirmed by a token another writer just rotated - it retries instead", async () => {
  let reads = 0;
  const { deps, changes } = fakeDeps({
    refreshAccessToken: async () => {
      throw httpError(400);
    },
    // The first read is the event's own; the re-check after the rejection finds a newer token.
    getAthlete: async () => (reads++ === 0 ? ATHLETE : { ...ATHLETE, refreshToken: "rotated-by-someone-else" }),
  });

  await assert.rejects(processWebhookEvent(event({ object_type: "athlete", aspect_type: "update", updates: { authorized: "false" } }), deps));
  assert.deepEqual(changes.removed, []);
});

// A queue whose processing fails `failures` times; records what was reported and deleted.
function fakeQueue(queued: QueuedWebhookEvent | null, overrides: Partial<QueueDeps> = {}) {
  const calls = { reported: [] as string[], deleted: [] as string[], counted: 0 };
  const deps: QueueDeps = {
    getQueued: async () => queued,
    process: async () => "stored",
    deleteQueued: async (id) => void calls.deleted.push(id),
    countAttempt: async () => void calls.counted++,
    reportError: async (context) => void calls.reported.push(context),
    now: () => 1_000_000,
    ...overrides,
  };
  return { deps, calls };
}

const failing = {
  process: async (): Promise<string> => {
    throw new Error("Strava is down");
  },
};

test("a queued event is processed and removed from the queue", async () => {
  const { deps, calls } = fakeQueue({ event: event(), receivedAt: 1_000_000, attempts: 0 });

  await handleQueuedWebhookEvent("q1", deps);

  assert.deepEqual(calls, { reported: [], deleted: ["q1"], counted: 0 });
});

test("a queued event that's already gone (a duplicate delivery) is left alone", async () => {
  const { deps, calls } = fakeQueue(null, failing);

  await handleQueuedWebhookEvent("q1", deps);

  assert.deepEqual(calls, { reported: [], deleted: [], counted: 0 });
});

test("a failing queued event is reported on its first attempt only, and retried", async () => {
  const first = fakeQueue({ event: event(), receivedAt: 1_000_000, attempts: 0 }, failing);
  const later = fakeQueue({ event: event(), receivedAt: 1_000_000 - 3600, attempts: 4 }, failing);

  await assert.rejects(handleQueuedWebhookEvent("q1", first.deps));
  await assert.rejects(handleQueuedWebhookEvent("q1", later.deps));

  assert.equal(first.calls.reported.length, 1);
  assert.match(first.calls.reported[0], /failed - retrying/);
  assert.deepEqual(later.calls.reported, []);
  assert.equal(first.calls.counted + later.calls.counted, 2);
});

test("a queued event still failing near the end of the retry window is given up on, reported and removed", async () => {
  const { deps, calls } = fakeQueue({ event: event(), receivedAt: 1_000_000 - WEBHOOK_EVENT_GIVE_UP_SECONDS, attempts: 30 }, failing);

  await handleQueuedWebhookEvent("q1", deps);

  assert.deepEqual(calls.deleted, ["q1"]);
  assert.match(calls.reported[0], /Giving up .* after 31 attempts/);
});
