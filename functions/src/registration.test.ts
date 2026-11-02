// Run with: npm test
import { test } from "node:test";
import assert from "node:assert/strict";

import { registerAthlete, RegistrationDeps } from "./registration";
import { TokenFromCodeResponse } from "./strava";

const TOKEN: TokenFromCodeResponse = { refresh_token: "refresh", athlete: { id: 7, firstname: "Test", lastname: "Athlete", profile: "" } };

function alreadyExists(): Error {
  return Object.assign(new Error("6 ALREADY_EXISTS: Document already exists"), { code: 6 });
}

// Records what was stored, revoked and reported.
function fakeDeps(overrides: Partial<RegistrationDeps> = {}) {
  const calls = { stored: 0, saved: [] as string[], revoked: [] as string[], reported: [] as string[] };
  const deps: RegistrationDeps = {
    isRegistered: async () => false,
    store: async () => void calls.stored++,
    saveToken: async (_athleteId, refreshToken) => void calls.saved.push(refreshToken),
    revoke: async (refreshToken) => void calls.revoked.push(refreshToken),
    reportError: async (context) => void calls.reported.push(context),
    ...overrides,
  };
  return { deps, calls };
}

test("a new athlete is stored, and their grant kept", async () => {
  const { deps, calls } = fakeDeps();

  assert.equal(await registerAthlete(TOKEN, deps), true);
  assert.deepEqual(calls, { stored: 1, saved: [], revoked: [], reported: [] });
});

test("an already registered athlete isn't stored again, but gets the new token, and keeps their grant", async () => {
  const { deps, calls } = fakeDeps({ isRegistered: async () => true });

  assert.equal(await registerAthlete(TOKEN, deps), false);
  assert.deepEqual(calls, { stored: 0, saved: ["refresh"], revoked: [], reported: [] });
});

test("a failed save revokes the new grant, so it isn't left behind, and still fails", async () => {
  const { deps, calls } = fakeDeps({
    store: async () => {
      throw new Error("Firestore unavailable");
    },
  });

  await assert.rejects(registerAthlete(TOKEN, deps), /Firestore unavailable/);
  assert.deepEqual(calls.revoked, ["refresh"]);
});

test("a failed registration check doesn't revoke - they may already be registered", async () => {
  const { deps, calls } = fakeDeps({
    isRegistered: async () => {
      throw new Error("Firestore unavailable");
    },
  });

  await assert.rejects(registerAthlete(TOKEN, deps), /Firestore unavailable/);
  assert.deepEqual(calls.revoked, []);
  assert.match(calls.reported[0], /may be registered - not revoking/);
});

test("a save that failed but landed anyway (e.g. a timeout) doesn't revoke", async () => {
  let checks = 0;
  const { deps, calls } = fakeDeps({
    isRegistered: async () => checks++ > 0,
    store: async () => {
      throw new Error("DEADLINE_EXCEEDED");
    },
  });

  await assert.rejects(registerAthlete(TOKEN, deps), /DEADLINE_EXCEEDED/);
  assert.deepEqual(calls.revoked, []);
  assert.match(calls.reported[0], /are registered - not revoking/);
});

test("an athlete registered meanwhile (a double submit) keeps their grant", async () => {
  const { deps, calls } = fakeDeps({
    store: async () => {
      throw alreadyExists();
    },
  });

  assert.equal(await registerAthlete(TOKEN, deps), false);
  assert.deepEqual(calls.revoked, []);
});

test("a revoke that fails too is reported, and the original error still comes back", async () => {
  const { deps, calls } = fakeDeps({
    store: async () => {
      throw new Error("Firestore unavailable");
    },
    revoke: async () => {
      throw new Error("Strava unavailable");
    },
  });

  await assert.rejects(registerAthlete(TOKEN, deps), /Firestore unavailable/);
  assert.match(calls.reported[0], /Couldn't revoke Strava access for athlete 7/);
});
