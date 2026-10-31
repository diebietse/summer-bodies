// Run with: npm test
import { test } from "node:test";
import assert from "node:assert/strict";

import moment from "moment";

import { buildDrawSnapshot, drandRoundAt, drandRoundTime, DRAW_PRIZES_USD, isChallengeAward, isDatedAward } from "./draw";
import { weekLabel } from "./util";

const challenge = { startDate: "2026-10-05", endDate: "2026-11-01" };

test("entries are in name order with consecutive ticket ranges, each week's FitCoin squared", () => {
  const snapshot = buildDrawSnapshot(
    [
      { name: "Casey", award: "Mon Oct 05 2026", fitcoin: 3 },
      { name: "Alex", award: "Mon Oct 12 2026", fitcoin: 4 },
      { name: "Alex", award: "Mon Oct 05 2026", fitcoin: 6 },
      { name: "Blake", award: "Mon Oct 12 2026", fitcoin: 1 },
    ],
    challenge,
    1793872800,
    new Date("2026-11-02T10:00:00Z"),
  );

  assert.deepEqual(snapshot.entries, [
    { name: "Alex", fitcoin: 10, weeklyFitcoin: { "Mon Oct 05 2026": 6, "Mon Oct 12 2026": 4 }, tickets: 52, firstTicket: 1, lastTicket: 52 },
    { name: "Blake", fitcoin: 1, weeklyFitcoin: { "Mon Oct 12 2026": 1 }, tickets: 1, firstTicket: 53, lastTicket: 53 },
    { name: "Casey", fitcoin: 3, weeklyFitcoin: { "Mon Oct 05 2026": 3 }, tickets: 9, firstTicket: 54, lastTicket: 62 },
  ]);
  assert.equal(snapshot.totalTickets, 62);
});

test("the streak challenge is squared on its own, listed after the weeks", () => {
  const snapshot = buildDrawSnapshot(
    [
      { name: "Alex", award: "streak-2026-10-05", fitcoin: 12 },
      { name: "Alex", award: "Mon Oct 12 2026", fitcoin: 3 },
      { name: "Alex", award: "Mon Oct 05 2026", fitcoin: 5 },
    ],
    challenge,
    1793872800,
    new Date(),
  );

  assert.deepEqual(Object.entries(snapshot.entries[0].weeklyFitcoin), [
    ["Mon Oct 05 2026", 5],
    ["Mon Oct 12 2026", 3],
    ["streak-2026-10-05", 12],
  ]);
  assert.equal(snapshot.entries[0].tickets, 25 + 9 + 144);
});

test("someone who joins late is only short the weeks they missed", () => {
  const weeks = ["Mon Oct 05 2026", "Mon Oct 12 2026", "Mon Oct 19 2026", "Mon Oct 26 2026"];
  const snapshot = buildDrawSnapshot(
    [...weeks.map((award) => ({ name: "Early", award, fitcoin: 30 })), ...weeks.slice(2).map((award) => ({ name: "Late", award, fitcoin: 30 }))],
    challenge,
    1793872800,
    new Date(),
  );

  const [early, late] = snapshot.entries;
  assert.equal(early.tickets, 2 * late.tickets);
});

test("athletes without FitCoin hold no tickets", () => {
  const snapshot = buildDrawSnapshot(
    [
      { name: "Alex", award: "Mon Oct 05 2026", fitcoin: 0 },
      { name: "Blake", award: "Mon Oct 05 2026", fitcoin: 2 },
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

  const snapshot = buildDrawSnapshot([{ name: "Alex", award: "Mon Oct 05 2026", fitcoin: 1 }], challenge, drawTime, new Date());
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

test("isChallengeAward keeps the challenge's weeks and its streak award", () => {
  for (const award of ["Mon Oct 05 2026", "Mon Oct 26 2026", "streak-2026-10-05"]) assert.equal(isChallengeAward(award, challenge), true, award);
});

test("isChallengeAward drops other seasons' awards and weeks outside the challenge", () => {
  for (const award of ["Mon Oct 06 2025", "streak-Mon Oct 13 2025", "streak-2025-10-06", "Mon Nov 02 2026", "Mon Sep 28 2026", "tie-fix-weeks-1-3"]) {
    assert.equal(isChallengeAward(award, challenge), false, award);
  }
});

test("isChallengeAward keeps a week that only partly overlaps a challenge that doesn't start or end on a week boundary", () => {
  const midWeek = { startDate: "2026-10-07", endDate: "2026-10-28" };

  assert.equal(isChallengeAward("Mon Oct 05 2026", midWeek), true);
  assert.equal(isChallengeAward("Mon Oct 26 2026", midWeek), true);
  assert.equal(isChallengeAward("Mon Nov 02 2026", midWeek), false);
});

test("isChallengeAward recognises the labels the weekly job stores", () => {
  assert.equal(isChallengeAward(weekLabel(moment.utc("2026-10-07T12:00:00Z")), challenge), true);
});

test("isChallengeAward counts older award names by the week or date in them", () => {
  assert.equal(isChallengeAward("streak-Mon Oct 12 2026", challenge), true);
  assert.equal(isChallengeAward("tie-fix-2026-10-05", challenge), true);
});

test("isDatedAward flags award names that can never count towards a challenge", () => {
  for (const award of ["Mon Oct 05 2026", "streak-Mon Oct 12 2026", "streak-2026-10-05", "tie-fix-2026-10-05"])
    assert.equal(isDatedAward(award), true, award);
  assert.equal(isDatedAward("tie-fix-weeks-1-3"), false);
});
