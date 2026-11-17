// Run with: npm test
import { test } from "node:test";
import assert from "node:assert/strict";

import { compareStravaIds, isStravaId, parseJsonWithStringIds, stringIdReviver } from "./stravaIds";

// 2^53 + 1: the first integer a JS number can't hold - plain JSON.parse turns it into ...992.
const BIG_ID = "9007199254740993";

test("parseJsonWithStringIds keeps 64-bit activity and athlete ids exact, as strings", () => {
  assert.notEqual(String(JSON.parse(`{"id": ${BIG_ID}}`).id), BIG_ID);

  const activity = parseJsonWithStringIds(`{"id": ${BIG_ID}, "athlete": {"id": 123}, "distance": 1474.7, "name": "Run"}`);

  assert.deepEqual(activity, { id: BIG_ID, athlete: { id: "123" }, distance: 1474.7, name: "Run" });
});

test("parseJsonWithStringIds converts ids inside arrays too, like an activity list", () => {
  assert.deepEqual(parseJsonWithStringIds(`[{"id": 1}, {"id": ${BIG_ID}}]`), [{ id: "1" }, { id: BIG_ID }]);
});

test("stringIdReviver converts only the given keys - a webhook's subscription_id and event_time stay numbers", () => {
  const event = JSON.parse(
    `{"object_type": "activity", "object_id": ${BIG_ID}, "owner_id": 7, "subscription_id": 383486, "event_time": 1700000000}`,
    stringIdReviver(new Set(["object_id", "owner_id"])),
  );

  assert.deepEqual(event, { object_type: "activity", object_id: BIG_ID, owner_id: "7", subscription_id: 383486, event_time: 1700000000 });
});

test("stringIdReviver leaves ids that are already strings alone", () => {
  assert.deepEqual(parseJsonWithStringIds(`{"id": "${BIG_ID}"}`), { id: BIG_ID });
});

test("compareStravaIds orders ids by value, past 2^53 and across lengths", () => {
  const ids = [BIG_ID, "10", "9", "9007199254740992", "123"];

  assert.deepEqual([...ids].sort(compareStravaIds), ["9", "10", "123", "9007199254740992", BIG_ID]);
  assert.equal(compareStravaIds("5", "5"), 0);
});

test("isStravaId accepts only the digits of a non-negative integer", () => {
  assert.equal(isStravaId(BIG_ID), true);
  for (const value of [42, "", "-1", "1.5", "12a", null, undefined]) assert.equal(isStravaId(value), false, String(value));
});
