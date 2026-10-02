import { Athlete, AthleteWithActivities, StoredActivity } from "./challenge-models";
import { Firestore, SummerBodiesConfig } from "./firestore";
import { Strava } from "./strava";
import { now } from "./util";
import { handleQueuedWebhookEvent, processWebhookEvent } from "./webhookEvents";
import { reportError, reportWarning } from "./errorReporting";
import {
  isLivenessCheckTime,
  mergeIntoAthletesWithActivities,
  missedStoredActivities,
  staleStoredActivityIds,
  toStoredActivity,
  webhookLivenessProblems,
} from "./activityLogic";

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
// Shared by backfillAthleteActivities (below) and the webhook event handling (webhookDeps) - both need this same
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

export interface ReconciliationResult {
  // Polled activities that weren't in the store - each a create event the webhook pipeline missed.
  missed: MissedActivity[];
  // Ids of stored activities the poll proved are gone (see activityLogic.staleStoredActivityIds), now deleted.
  removed: number[];
}

// Makes the store match a fresh live poll of [startUnixTime, endUnixTime): upserts every polled activity and
// deletes the stored ones the poll proved are gone, then reports both - the evidence of what the webhook pipeline
// missed, needed to eventually decide whether this safety net is still earning its keep.
//
// Every polled activity gets upserted, not just the ones found missing: a missing id only catches a missed
// *create* event, but an activity whose data changed via a missed *update* event still needs correcting too,
// and there's no cheap way to tell "changed" from "unchanged" without a full field comparison. Using now()
// as the event time means this always wins over a stored write, by design - at this app's scale (dozens of
// athletes) the resulting redundant writes for already-correct data are negligible.
export async function syncActivitiesIntoStore(
  athletesWithActivities: AthleteWithActivities[],
  startUnixTime: number,
  endUnixTime: number,
): Promise<ReconciliationResult> {
  const storedActivities = await Firestore.getActivitiesInRange(startUnixTime, endUnixTime);
  const missed = missedStoredActivities(storedActivities, athletesWithActivities);
  const eventTime = now();
  const upserts = athletesWithActivities.flatMap((athlete) =>
    athlete.activities.map((activity) => Firestore.upsertActivity(toStoredActivity(activity, athlete.id, eventTime))),
  );

  const removed = staleStoredActivityIds(storedActivities, athletesWithActivities);
  await Promise.all([...upserts, Firestore.deleteActivities(removed)]);
  return { missed, removed };
}

// Handles one queued webhook event - see webhookEvents.handleQueuedWebhookEvent.
export async function processQueuedWebhookEvent(id: string): Promise<void> {
  const config = await Firestore.getConfig();
  const outcome = await handleQueuedWebhookEvent(id, {
    getQueued: (eventId) => Firestore.getQueuedWebhookEvent(eventId),
    process: (event) => processWebhookEvent(event, webhookDeps(config)),
    deleteQueued: (eventId) => Firestore.deleteWebhookEvent(eventId),
    countAttempt: (eventId) => Firestore.countWebhookEventAttempt(eventId),
    reportError: (context, error) => reportError(context, error, config),
    now,
  });
  console.log(`Strava webhook ${outcome}`);
}

// A queued event still there after Cloud Functions has stopped retrying it (see handleQueuedWebhookEvent) means its
// processing never finished - e.g. the function timed out on every attempt. Reported and cleared once a day.
export async function sweepStuckWebhookEvents(config: SummerBodiesConfig): Promise<void> {
  try {
    const stuck = await Firestore.getWebhookEventsReceivedBefore(now() - 24 * 60 * 60);
    if (stuck.length === 0) return;
    const lines = stuck.map(
      ({ id, queued: { event } }) => `${id}: ${event.object_type} ${event.aspect_type} ${event.object_id} of athlete ${event.owner_id}`,
    );
    await reportWarning(`${stuck.length} Strava webhook events were never processed - removed from the queue`, lines.join("\n"), config);
    await Promise.all(stuck.map(({ id }) => Firestore.deleteWebhookEvent(id)));
  } catch (error) {
    await reportError("Couldn't check for stuck Strava webhook events", error, config);
  }
}

function webhookDeps(config: SummerBodiesConfig) {
  const strava = new Strava(config.stravaClientId, config.stravaClientSecret);
  return {
    getAthlete: (athleteId: string) => Firestore.getAthlete(athleteId),
    refreshAccessToken: (athlete: Athlete) => refreshAndPersistAthleteToken(config.stravaClientId, config.stravaClientSecret, athlete),
    getActivity: (accessToken: string, activityId: number) => strava.getActivity(accessToken, activityId),
    upsertActivity: (activity: StoredActivity) => Firestore.upsertActivity(activity),
    deleteActivity: (activityId: number, athleteId: string) => Firestore.deleteActivity(activityId, athleteId),
    removeAthlete: (athleteId: string) => Firestore.removeAthlete(athleteId, config.challengeStartDate),
  };
}

// Checked daily during the challenge (see activityLogic.isLivenessCheckTime) - see
// activityLogic.webhookLivenessProblems. Only reports; never throws.
export async function checkWebhookLiveness(config: SummerBodiesConfig): Promise<void> {
  const timeNow = now();
  if (!isLivenessCheckTime(timeNow, config.challengeStartDate, config.challengeEndDate)) return;
  try {
    const [subscriptions, lastEventAt] = await Promise.all([
      Strava.viewPushSubscriptions(config.stravaClientId, config.stravaClientSecret),
      Firestore.getLastWebhookEventAt(),
    ]);
    const problems = webhookLivenessProblems({
      subscriptionIds: subscriptions.map((subscription) => subscription.id),
      configuredSubscriptionId: config.stravaWebhookSubscriptionId,
      lastEventAt,
      now: timeNow,
      maxSilenceSeconds: 24 * 60 * 60,
    });
    if (problems.length > 0) await reportWarning("Strava webhooks may not be arriving", problems.join("\n"), config);
  } catch (error) {
    await reportError("Couldn't check whether Strava webhooks are arriving", error, config);
  }
}
