// Run with: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import moment from "moment";

import { weekDateStrings } from "./util";

test("weekDateStrings lists every day from start (inclusive) to end (exclusive)", () => {
  const start = moment.utc("2026-10-05T00:00:00Z").unix();
  const end = moment.utc("2026-10-12T00:00:00Z").unix();

  assert.deepEqual(weekDateStrings(start, end), ["2026-10-05", "2026-10-06", "2026-10-07", "2026-10-08", "2026-10-09", "2026-10-10", "2026-10-11"]);
});

test("weekDateStrings returns an empty list when start and end are the same instant", () => {
  const instant = moment.utc("2026-10-05T00:00:00Z").unix();

  assert.deepEqual(weekDateStrings(instant, instant), []);
});
