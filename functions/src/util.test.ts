// Run with: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import moment from "moment";

import { weekDateStrings, weeksAgo, weeksAgoUnix } from "./util";

// SAST is UTC+2, so Monday 00:00 SAST is Sunday 22:00 UTC.
test("weekDateStrings lists every day from start (inclusive) to end (exclusive)", () => {
  const start = moment.utc("2026-10-04T22:00:00Z").unix();
  const end = moment.utc("2026-10-11T22:00:00Z").unix();

  assert.deepEqual(weekDateStrings(start, end), ["2026-10-05", "2026-10-06", "2026-10-07", "2026-10-08", "2026-10-09", "2026-10-10", "2026-10-11"]);
});

test("weekDateStrings returns an empty list when start and end are the same instant", () => {
  const instant = moment.utc("2026-10-04T22:00:00Z").unix();

  assert.deepEqual(weekDateStrings(instant, instant), []);
});

test("the week starts Monday 00:00 SAST, i.e. Sunday 22:00 UTC", () => {
  const justAfterMondayStart = moment.utc("2026-10-04T22:30:00Z");
  const justBeforeMondayStart = moment.utc("2026-10-04T21:30:00Z");

  assert.equal(weeksAgoUnix(0, justAfterMondayStart), moment.utc("2026-10-04T22:00:00Z").unix());
  assert.equal(weeksAgoUnix(0, justBeforeMondayStart), moment.utc("2026-09-27T22:00:00Z").unix());
  assert.equal(weeksAgo(1, justAfterMondayStart).format("YYYY-MM-DD"), "2026-09-28");
  assert.equal(weeksAgoUnix(-1, justAfterMondayStart), moment.utc("2026-10-11T22:00:00Z").unix());
});
