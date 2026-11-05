// Run with: npm test
import { test } from "node:test";
import assert from "node:assert/strict";

import { revokeThenRemove, RemovalDeps } from "./athleteRemoval";
import { Athlete } from "./challenge-models";

const ATHLETE: Athlete = { id: "7", firstname: "Test", lastname: "Athlete", profile: "", refreshToken: "refresh" };

function fakeDeps(revokeFails: boolean) {
  const calls: string[] = [];
  const deps: RemovalDeps = {
    revoke: async (token) => {
      calls.push(`revoke ${token}`);
      if (revokeFails) throw new Error("Strava unavailable");
    },
    remove: async (id) => void calls.push(`remove ${id}`),
  };
  return { deps, calls };
}

test("revokeThenRemove revokes before it removes", async () => {
  const { deps, calls } = fakeDeps(false);

  assert.deepEqual(await revokeThenRemove(ATHLETE, deps), { removed: true });
  assert.deepEqual(calls, ["revoke refresh", "remove 7"]);
});

test("revokeThenRemove keeps the athlete (and their token) when the revoke fails", async () => {
  const { deps, calls } = fakeDeps(true);

  const result = await revokeThenRemove(ATHLETE, deps);

  assert.equal(result.removed, false);
  assert.match(String(result.revokeError), /Strava unavailable/);
  assert.deepEqual(calls, ["revoke refresh"]);
});

test("revokeThenRemove removes anyway when forced, still reporting the failed revoke", async () => {
  const { deps, calls } = fakeDeps(true);

  const result = await revokeThenRemove(ATHLETE, deps, true);

  assert.equal(result.removed, true);
  assert.ok(result.revokeError);
  assert.deepEqual(calls, ["revoke refresh", "remove 7"]);
});
