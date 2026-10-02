// Pure logic for the Strava-webhook-fed activity store - deliberately free of any Firestore/Strava network
// imports (unlike activityStore.ts, which uses these) so it can be unit-tested without triggering
// firebase-admin's app initialization as an import side effect.
import { Athlete, AthleteWithActivities, Activity, StoredActivity } from "./challenge-models";
import { StravaWebhookEvent } from "./strava";

// Converts a Strava activity into its stored shape - shared by the webhook event handler (eventTime = the
// webhook's own event_time) and anything that writes activities outside the webhook pipeline, like the
// weekly reconciliation or a new athlete's registration backfill (eventTime = now()).
export function toStoredActivity(activity: Activity, athleteId: string, eventTime: number): StoredActivity {
  return {
    ...activity,
    athleteId,
    startDateUnix: Math.floor(new Date(activity.start_date).getTime() / 1000),
    lastEventTime: eventTime,
  };
}

// Combines registered athletes with their stored activities for a date range into the exact shape
// Challenge.calculateResults already consumes, so switching Bot.publishDailyUpdates from a live poll to the
// webhook-fed store didn't require any change to challenge.ts's business logic.
export function mergeIntoAthletesWithActivities(athletes: Athlete[], storedActivities: StoredActivity[]): AthleteWithActivities[] {
  const activitiesByAthlete = new Map<string, Activity[]>();
  for (const { athleteId, startDateUnix: _startDateUnix, lastEventTime: _lastEventTime, ...activity } of storedActivities) {
    const list = activitiesByAthlete.get(athleteId) ?? [];
    list.push(activity);
    activitiesByAthlete.set(athleteId, list);
  }

  return athletes.map((athlete) => ({
    ...athlete,
    activities: activitiesByAthlete.get(athlete.id) ?? [],
  }));
}

// True for the specific webhook event Strava sends when an athlete deauthorizes the app - see
// https://developers.strava.com/docs/webhooks/. api.ts's handleWebhookEvent is the only caller.
export function isDeauthorizationEvent(event: StravaWebhookEvent): boolean {
  return event.object_type === "athlete" && event.aspect_type === "update" && event.updates?.authorized === "false";
}

// True when an incoming write is older than what's already stored, so a late/out-of-order webhook retry
// (e.g. a delayed retry of an "update" arriving after a newer one already wrote fresher data) can't
// overwrite newer data with older - see Firestore.upsertActivity, the only caller.
export function shouldSkipStaleWrite(existingLastEventTime: number | undefined, incomingEventTime: number): boolean {
  return existingLastEventTime !== undefined && existingLastEventTime > incomingEventTime;
}
