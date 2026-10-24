// Run with: npm test
import { test } from "node:test";
import assert from "node:assert/strict";

import { buildDrawSnapshot, drandRoundAt, drandRoundTime, DRAW_PRIZES_USD } from "./draw";

const challenge = { startDate: "2026-10-05", endDate: "2026-11-01" };

test("entries are in name order with consecutive ticket ranges, one ticket per FitCoin", () => {
  const snapshot = buildDrawSnapshot(
    [
      { name: "Casey", fitcoin: 3 },
      { name: "Alex", fitcoin: 10 },
      { name: "Blake", fitcoin: 1 },
    ],
    challenge,
    1793872800,
    new Date("2026-11-02T10:00:00Z"),
  );

  assert.deepEqual(snapshot.entries, [
    { name: "Alex", fitcoin: 10, firstTicket: 1, lastTicket: 10 },
    { name: "Blake", fitcoin: 1, firstTicket: 11, lastTicket: 11 },
    { name: "Casey", fitcoin: 3, firstTicket: 12, lastTicket: 14 },
  ]);
  assert.equal(snapshot.totalTickets, 14);
});

test("athletes without FitCoin hold no tickets", () => {
  const snapshot = buildDrawSnapshot(
    [
      { name: "Alex", fitcoin: 0 },
      { name: "Blake", fitcoin: 2 },
    ],
    challenge,
    1793872800,
    new Date(),
  );

  assert.deepEqual(
    snapshot.entries.map((e) => e.name),
    ["Blake"],
  );
});

test("the draw uses the drand round published at the draw time", () => {
  // Checked against drand-client's roundAt/roundTime for quicknet: 2026-11-06 12:00 SAST is round 33718612.
  const drawTime = Date.parse("2026-11-06T10:00:00Z") / 1000;
  assert.equal(drandRoundAt(drawTime), 33718612);
  assert.equal(drandRoundTime(33718612), drawTime);
  // Between two rounds, the next one is used, so the draw never happens before the announced time.
  assert.equal(drandRoundAt(drawTime + 1), 33718613);

  const snapshot = buildDrawSnapshot([{ name: "Alex", fitcoin: 1 }], challenge, drawTime, new Date());
  assert.deepEqual(snapshot.drand.round, 33718612);
  assert.equal(snapshot.drand.roundTime, "2026-11-06T10:00:00.000Z");
});

test("there are 20 prizes: $210, $110, $60, then 17 x $20", () => {
  assert.equal(DRAW_PRIZES_USD.length, 20);
  assert.deepEqual(DRAW_PRIZES_USD.slice(0, 4), [210, 110, 60, 20]);
  assert.equal(
    DRAW_PRIZES_USD.reduce((a, b) => a + b, 0),
    720,
  );
});
