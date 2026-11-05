// Removing a registered athlete (examples/remove-athlete.ts, examples/reset-season.ts) - free of Firestore/Strava
// network imports (they come in through RemovalDeps) so it can be unit-tested without firebase-admin.
import { Athlete } from "./challenge-models";

export interface RemovalDeps {
  // Revokes the athlete's grant on Strava's side - see Strava.revokeToken.
  revoke(refreshToken: string): Promise<void>;
  // Deletes our copy of them - see Firestore.removeAthlete.
  remove(athleteId: string): Promise<void>;
}

// Revokes, then removes. Revoke must come first: once their refresh token is deleted there's no way to ever revoke the
// grant, which then counts as a connected athlete forever. Strava answers 200 even for an already revoked or unknown
// token, so a failed revoke is a real failure (try again later): the athlete is kept, unless `force`.
export async function revokeThenRemove(athlete: Athlete, deps: RemovalDeps, force = false): Promise<{ removed: boolean; revokeError?: unknown }> {
  try {
    await deps.revoke(athlete.refreshToken);
  } catch (revokeError) {
    if (!force) return { removed: false, revokeError };
    await deps.remove(athlete.id);
    return { removed: true, revokeError };
  }
  await deps.remove(athlete.id);
  return { removed: true };
}
