// Run with: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { AxiosError, AxiosHeaders } from "axios";

import { Strava } from "./strava";
import { Athlete } from "./challenge-models";

function athlete(refreshToken: string): Athlete {
  return { id: "1", firstname: "Test", lastname: "Athlete", profile: "", refreshToken };
}

function rejected(status: number): AxiosError {
  const headers = new AxiosHeaders();
  return new AxiosError("Request failed", "ERR_BAD_REQUEST", undefined, undefined, {
    status,
    statusText: "",
    headers,
    config: { headers },
    data: {},
  });
}

// A Strava whose activity fetch returns nothing, and whose token refresh only accepts `validRefreshToken`.
function stravaAccepting(t: { mock: { method: Function } }, validRefreshToken: string): { strava: Strava; refreshedWith: string[] } {
  const refreshedWith: string[] = [];
  t.mock.method(Strava, "getToken", async (_clientId: string, _clientSecret: string, refreshToken: string) => {
    refreshedWith.push(refreshToken);
    if (refreshToken !== validRefreshToken) throw rejected(400);
    return { access_token: "access", refresh_token: "rotated" };
  });
  const strava = new Strava("client", "secret");
  t.mock.method(strava, "getAthleteActivities", async () => []);
  return { strava, refreshedWith };
}

test("populateAthleteActivities retries once with the stored refresh token when another writer rotated it", async (t) => {
  const { strava, refreshedWith } = stravaAccepting(t, "new");

  const result = await strava.populateAthleteActivities(athlete("old"), 0, 1, async () => "new");

  assert.deepEqual(refreshedWith, ["old", "new"]);
  assert.equal(result.refreshToken, "rotated");
});

test("populateAthleteActivities fails without retrying when the stored refresh token hasn't changed", async (t) => {
  const { strava, refreshedWith } = stravaAccepting(t, "new");

  await assert.rejects(strava.populateAthleteActivities(athlete("old"), 0, 1, async () => "old"));
  assert.deepEqual(refreshedWith, ["old"]);
});

test("populateAthleteActivities doesn't retry on errors other than a rejected refresh token", async (t) => {
  const strava = new Strava("client", "secret");
  let calls = 0;
  t.mock.method(Strava, "getToken", async () => {
    calls++;
    throw rejected(503);
  });

  await assert.rejects(strava.populateAthleteActivities(athlete("old"), 0, 1, async () => "new"));
  assert.equal(calls, 1);
});
