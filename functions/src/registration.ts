// Registering an athlete from a Strava authorization code exchange (POST /athlete in api.ts) - free of Firestore/Strava
// network imports (they come in through RegistrationDeps) so it can be unit-tested without firebase-admin.
import { TokenFromCodeResponse } from "./strava";

export interface RegistrationDeps {
  isRegistered(athleteId: number): Promise<boolean>;
  store(token: TokenFromCodeResponse): Promise<void>;
  // Replaces a registered athlete's stored refresh token.
  saveToken(athleteId: number, refreshToken: string): Promise<void>;
  // Revokes the athlete's grant on Strava's side - see Strava.revokeToken.
  revoke(refreshToken: string): Promise<void>;
  reportError(context: string, error: unknown): Promise<void>;
}

// Firestore's ALREADY_EXISTS (gRPC code 6), from storeAthlete's create() when the athlete got registered meanwhile.
function isAlreadyExists(error: unknown): boolean {
  return (error as { code?: unknown } | null)?.code === 6;
}

// Saves a newly authorized athlete; true if they were new, false if already registered. An already registered athlete
// gets the new token saved over theirs - the same grant, so registering again is how a broken stored token is
// repaired. The code exchange has already granted us access on Strava's side, so if saving a new athlete fails the
// grant would be left behind with no token of ours to ever revoke it - still counting as a connected athlete. So it's
// revoked straight away, and they can simply register again. But only once a fresh check says they aren't registered:
// revoking ends the whole grant, so revoking for someone already registered (a double-submitted registration, a check
// that failed for a moment, a save that landed but timed out) would kill the token we hold for them.
export async function registerAthlete(token: TokenFromCodeResponse, deps: RegistrationDeps): Promise<boolean> {
  try {
    if (await deps.isRegistered(token.athlete.id)) {
      await deps.saveToken(token.athlete.id, token.refresh_token);
      return false;
    }
    await deps.store(token);
    return true;
  } catch (error) {
    if (isAlreadyExists(error)) return false;
    let registered: boolean | undefined;
    try {
      registered = await deps.isRegistered(token.athlete.id);
    } catch {
      registered = undefined;
    }
    if (registered === false) {
      try {
        await deps.revoke(token.refresh_token);
      } catch (revokeError) {
        await deps.reportError(`Couldn't revoke Strava access for athlete ${token.athlete.id} after their registration failed`, revokeError);
      }
    } else {
      await deps.reportError(
        `Registration of athlete ${token.athlete.id} failed and they ${registered ? "are registered" : "may be registered"} - not revoking their Strava access; check them`,
        error,
      );
    }
    throw error;
  }
}
