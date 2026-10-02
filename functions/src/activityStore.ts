import { Athlete, AthleteWithActivities } from "./challenge-models";
import { Firestore } from "./firestore";
import { Strava } from "./strava";
import { now } from "./util";
import { toStoredActivity, mergeIntoAthletesWithActivities } from "./activityLogic";

export async function getAthletesActivitiesFromStore(startUnixTime: number, endUnixTime: number): Promise<AthleteWithActivities[]> {
  const [athletes, storedActivities] = await Promise.all([
    Firestore.getRegisteredAthletes(),
    Firestore.getActivitiesInRange(startUnixTime, endUnixTime),
  ]);
  return mergeIntoAthletesWithActivities(athletes, storedActivities);
}

// Refreshes one athlete's Strava token and immediately persists the rotation, returning the access token to
// use for whatever Strava call prompted the refresh. Persisting *before* that call matters: Strava
// invalidates the pre-rotation refresh token as soon as it's used, so if the follow-up call failed before
// the new one was saved, the athlete's stored refresh token would be left pointing at an already-dead value.
// Shared by backfillAthleteActivities (below) and api.ts's webhook event handler - both need this same
// ordering, so a future fix to it only needs to land once.
export async function refreshAndPersistAthleteToken(clientId: string, clientSecret: string, athlete: Athlete): Promise<string> {
  const newToken = await Strava.getToken(clientId, clientSecret, athlete.refreshToken);
  await Firestore.updateAthletesRefreshToken([{ ...athlete, refreshToken: newToken.refresh_token }]);
  return newToken.access_token;
}

// Fetches and seeds one athlete's current-challenge-window activities into the store - used right after
// registration, since webhooks only fire for *future* activity changes, not anything logged before the
// athlete connected. Callers should treat failure as non-fatal: the gap just waits for this athlete's next
// webhook event or the next weekly reconciliation, same as any other gap.
export async function backfillAthleteActivities(
  clientId: string,
  clientSecret: string,
  athlete: Athlete,
  startUnixTime: number,
  endUnixTime: number,
): Promise<void> {
  const accessToken = await refreshAndPersistAthleteToken(clientId, clientSecret, athlete);

  const strava = new Strava(clientId, clientSecret);
  const activities = await strava.getAthleteActivities(accessToken, startUnixTime, endUnixTime);
  const eventTime = now();
  await Promise.all(activities.map((activity) => Firestore.upsertActivity(toStoredActivity(activity, athlete.id, eventTime))));
}

export interface MissedActivity {
  athleteName: string;
  activityId: number;
  startDate: string;
}

// Upserts freshly live-polled activities into the store (healing any gap left by a missed webhook event),
// and reports which ones weren't already there. Called once a week by the reconciliation poll
// (Bot.publishWeeklyResults) - this is the evidence needed to eventually decide whether that weekly safety
// net is still earning its keep, or whether the webhook pipeline alone is already reliable enough to drop it.
//
// Every polled activity gets upserted, not just the ones found missing: a missing id only catches a missed
// *create* event, but an activity whose data changed via a missed *update* event still needs correcting too,
// and there's no cheap way to tell "changed" from "unchanged" without a full field comparison. Using now()
// as the event time means this always wins over a stored write, by design - at this app's scale (dozens of
// athletes, a weekly reconciliation) the resulting redundant writes for already-correct data are negligible,
// so that's judged better than adding per-field diffing just to skip them.
export async function syncActivitiesIntoStore(
  athletesWithActivities: AthleteWithActivities[],
  startUnixTime: number,
  endUnixTime: number,
): Promise<MissedActivity[]> {
  const existingIds = new Set((await Firestore.getActivitiesInRange(startUnixTime, endUnixTime)).map((activity) => activity.id));
  const eventTime = now();
  const missed: MissedActivity[] = [];
  const upserts: Promise<void>[] = [];

  for (const athlete of athletesWithActivities) {
    const athleteName = `${athlete.firstname} ${athlete.lastname}`;
    for (const activity of athlete.activities) {
      if (!existingIds.has(activity.id)) {
        missed.push({ athleteName, activityId: activity.id, startDate: activity.start_date });
      }
      upserts.push(Firestore.upsertActivity(toStoredActivity(activity, athlete.id, eventTime)));
    }
  }

  await Promise.all(upserts);
  return missed;
}
