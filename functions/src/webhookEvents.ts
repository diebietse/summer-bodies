// What a Strava webhook event does to our data - deliberately free of Firestore/Strava network imports (they come in
// through WebhookDeps, wired up in activityStore.ts) so it can be unit-tested without firebase-admin.
//
// Strava doesn't sign webhook events (see https://developers.strava.com/docs/webhooks/), so an event is only ever a
// trigger to go and ask Strava, never a fact: the callback URL's secret path (api.ts) keeps out anyone who doesn't
// know it, and this re-checks everything with Strava before changing anything - nothing is deleted on an event's
// word alone.
import { isAxiosError } from "axios";
import { Activity, Athlete, StoredActivity } from "./challenge-models";
import { StravaWebhookEvent } from "./strava";
import { isDeauthorizationEvent, toStoredActivity } from "./activityLogic";

export interface WebhookDeps {
  getAthlete(athleteId: string): Promise<Athlete | null>;
  // Refreshes the athlete's Strava token, persisting the rotation, and returns an access token.
  refreshAccessToken(athlete: Athlete): Promise<string>;
  getActivity(accessToken: string, activityId: number): Promise<Activity & { athlete?: { id: number } }>;
  upsertActivity(activity: StoredActivity): Promise<void>;
  deleteActivity(activityId: number, athleteId: string): Promise<void>;
  removeAthlete(athleteId: string): Promise<void>;
}

function hasStatus(error: unknown, ...statuses: number[]): boolean {
  return isAxiosError(error) && statuses.includes(error.response?.status ?? 0);
}

// Refreshes the athlete's token, or returns null if Strava rejects it. Strava invalidates a refresh token as soon as
// it's used, and another writer (a concurrent event for the same athlete, or the weekly poll, which saves its rotated
// tokens only when it finishes) may have just used ours - so a rejection only counts once the stored token is
// unchanged. If it changed, this throws, to be retried with the new one.
async function refreshOrRejected(athlete: Athlete, deps: WebhookDeps): Promise<string | null> {
  try {
    return await deps.refreshAccessToken(athlete);
  } catch (error) {
    if (!hasStatus(error, 400, 401)) throw error;
    const stored = await deps.getAthlete(athlete.id);
    if (stored && stored.refreshToken !== athlete.refreshToken)
      throw new Error(`Athlete ${athlete.id}'s refresh token was rotated meanwhile - retrying`);
    return null;
  }
}

// Returns what it did, for the logs. Throws on anything that might succeed if tried again (Strava or Firestore
// being unavailable), so the caller retries.
export async function processWebhookEvent(event: StravaWebhookEvent, deps: WebhookDeps): Promise<string> {
  const athleteId = event.owner_id.toString();
  const athlete = await deps.getAthlete(athleteId);
  if (!athlete) return `ignored: athlete ${athleteId} isn't registered`;

  if (event.object_type === "athlete") {
    if (!isDeauthorizationEvent(event)) return "ignored: athlete update other than a deauthorization";
    // A real deauthorization revokes the athlete's tokens, so confirm it by trying theirs.
    if ((await refreshOrRejected(athlete, deps)) !== null)
      return `ignored: deauthorization of athlete ${athleteId} not confirmed - their token still works`;
    await deps.removeAthlete(athleteId);
    return `removed athlete ${athleteId}: deauthorized`;
  }

  // Create, update and delete are handled alike: fetch the activity and store whatever Strava says it now is.
  const accessToken = await refreshOrRejected(athlete, deps);
  // Their token is dead: nothing can be checked, and the deauthorization event (or the weekly results' failure
  // report) deals with the athlete.
  if (accessToken === null) return `ignored: athlete ${athleteId}'s token was rejected`;

  try {
    const activity = await deps.getActivity(accessToken, event.object_id);
    if (activity.athlete && activity.athlete.id !== event.owner_id) {
      return `ignored: activity ${event.object_id} belongs to athlete ${activity.athlete.id}, not ${athleteId}`;
    }
    await deps.upsertActivity(toStoredActivity(activity, athleteId, event.event_time));
    return `stored activity ${event.object_id}`;
  } catch (error) {
    // Gone, or no longer visible to us (e.g. made "Only You") - what a live poll would show as well.
    if (!hasStatus(error, 403, 404)) throw error;
    await deps.deleteActivity(event.object_id, athleteId);
    return `deleted activity ${event.object_id}: Strava no longer shows it`;
  }
}

export interface QueuedWebhookEvent {
  event: StravaWebhookEvent;
  receivedAt: number;
  attempts: number;
}

export interface QueueDeps {
  // The queued doc as it is now, or null once it's gone (processed by a duplicate delivery, or given up on).
  getQueued(id: string): Promise<QueuedWebhookEvent | null>;
  process(event: StravaWebhookEvent): Promise<string>;
  deleteQueued(id: string): Promise<void>;
  countAttempt(id: string): Promise<void>;
  reportError(context: string, error: unknown): Promise<void>;
  now(): number;
}

// Cloud Functions stops retrying a 2nd gen event 24 hours after its first attempt - so give up, and say so, before
// that, or a failing event would just stop being retried without a word. See
// https://firebase.google.com/docs/functions/retries.
export const WEBHOOK_EVENT_GIVE_UP_SECONDS = 20 * 60 * 60;

// Handles one queued webhook event - see processStravaWebhookEvent in index.ts. Reads the queued doc afresh on every
// attempt: a retry redelivers the original create event, whose snapshot never shows the attempts counted since.
// Throws to have the event retried; reports its first failure and giving up, not every retry.
export async function handleQueuedWebhookEvent(id: string, deps: QueueDeps): Promise<string> {
  const queued = await deps.getQueued(id);
  if (!queued) return `event ${id} already handled`;
  const { event } = queued;
  const description = `${event.object_type} ${event.aspect_type} ${event.object_id} of athlete ${event.owner_id}`;
  try {
    const outcome = await deps.process(event);
    await deps.deleteQueued(id);
    return `event ${id} (${description}): ${outcome}`;
  } catch (error) {
    if (deps.now() - queued.receivedAt >= WEBHOOK_EVENT_GIVE_UP_SECONDS) {
      await deps.reportError(`Giving up on Strava webhook event ${id} (${description}) after ${queued.attempts + 1} attempts`, error);
      await deps.deleteQueued(id);
      return `event ${id} given up`;
    }
    if (queued.attempts === 0) await deps.reportError(`Strava webhook event ${id} (${description}) failed - retrying`, error);
    await deps.countAttempt(id);
    throw error;
  }
}
