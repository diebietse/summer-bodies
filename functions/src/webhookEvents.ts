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
import { isDeauthorizationEvent, storedActivityChanged, toStoredActivity } from "./activityLogic";

export interface WebhookDeps {
  getAthlete(athleteId: string): Promise<Athlete | null>;
  // Refreshes the athlete's Strava token, persisting the rotation, and returns an access token.
  refreshAccessToken(athlete: Athlete): Promise<string>;
  getActivity(accessToken: string, activityId: number): Promise<Activity & { athlete?: { id: number } }>;
  upsertActivity(activity: StoredActivity): Promise<void>;
  // Skipped if a write newer than `eventTime` landed meanwhile - see Firestore.deleteActivity.
  deleteActivity(activityId: number, athleteId: string, eventTime?: number): Promise<void>;
  removeAthlete(athleteId: string): Promise<void>;
}

function hasStatus(error: unknown, ...statuses: number[]): boolean {
  return isAxiosError(error) && statuses.includes(error.response?.status ?? 0);
}

// Refreshes the athlete's token, or returns null if Strava rejects it. Strava invalidates a refresh token as soon as
// it's used, and another writer (a concurrent event for the same athlete, or the weekly poll, which saves its rotated
// tokens only when it finishes) may have just used ours - so a rejection only counts once the stored token is
// unchanged. If it changed, this throws, to be retried with the new one.
export class TokenRotatedError extends Error {}

async function refreshOrRejected(athlete: Athlete, deps: WebhookDeps): Promise<string | null> {
  try {
    return await deps.refreshAccessToken(athlete);
  } catch (error) {
    if (!hasStatus(error, 400, 401)) throw error;
    const stored = await deps.getAthlete(athlete.id);
    if (stored && stored.refreshToken !== athlete.refreshToken) {
      throw new TokenRotatedError(`Athlete ${athlete.id}'s refresh token was rotated meanwhile - retrying`);
    }
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
    await deps.deleteActivity(event.object_id, athleteId, event.event_time);
    return `deleted activity ${event.object_id}: Strava no longer shows it`;
  }
}

export interface RecheckDeps extends WebhookDeps {
  // The athlete's activities started in [afterUnix, beforeUnix) - one list call (see Strava.getAthleteActivities).
  listActivities(accessToken: string, afterUnix: number, beforeUnix: number): Promise<Activity[]>;
}

// Fixes what the webhooks didn't report about an athlete's recent activities - edits Strava sends no event for (only
// title, type and privacy changes send one, not a crop, a re-sync or a sport type change), and any missed create or
// delete: one list call for the window, then adds what isn't stored, updates what changed and deletes what Strava no
// longer shows (confirmed by id). `tokenRejected` when their token no longer works. Throws, like processWebhookEvent, on anything worth
// trying again.
export async function recheckAthleteActivities(
  athlete: Athlete,
  stored: StoredActivity[],
  window: { afterUnix: number; beforeUnix: number },
  deps: RecheckDeps,
  eventTime: number,
): Promise<{ changes: string[]; tokenRejected: boolean }> {
  const accessToken = await refreshOrRejected(athlete, deps);
  if (accessToken === null) return { changes: [], tokenRejected: true };
  const live = await deps.listActivities(accessToken, window.afterUnix, window.beforeUnix);
  const storedById = new Map(stored.map((activity) => [activity.id, activity]));
  const changes: string[] = [];
  for (const activity of live) {
    const storedCopy = storedById.get(activity.id);
    if (storedCopy && !storedActivityChanged(storedCopy, activity)) continue;
    await deps.upsertActivity(toStoredActivity(activity, athlete.id, eventTime));
    changes.push(`${storedCopy ? "updated" : "added"} ${activity.id}`);
  }
  // Missing from the list isn't proof it's gone - its start may have been moved out of the window, or the list hit its
  // 50-activity page - so each is fetched by id and deleted only if Strava no longer shows it, like a webhook delete.
  const liveIds = new Set(live.map((activity) => activity.id));
  for (const activity of stored.filter((s) => !liveIds.has(s.id))) {
    try {
      const current = await deps.getActivity(accessToken, activity.id);
      if (!storedActivityChanged(activity, current)) continue;
      await deps.upsertActivity(toStoredActivity(current, athlete.id, eventTime));
      changes.push(`updated ${activity.id}`);
    } catch (error) {
      if (!hasStatus(error, 403, 404)) throw error;
      await deps.deleteActivity(activity.id, athlete.id, eventTime);
      changes.push(`deleted ${activity.id}`);
    }
  }
  return { changes, tokenRejected: false };
}

export interface RecheckSummary {
  changes: string[];
  // Athletes whose token Strava rejected - they need registering again (or removing).
  rejected: string[];
  failures: string[];
  // Strava's rate limit was hit, so the athletes after it weren't checked.
  rateLimited: boolean;
}

// Rechecks (see recheckAthleteActivities) every athlete with a stored activity in the window, a few at a time so the
// calls don't all land at once, stopping at the first rate limit (429) rather than spending more of what webhook
// events need. A token rotated meanwhile by another writer is retried once with the stored one.
export async function recheckRecentActivityOwners(
  stored: StoredActivity[],
  window: { afterUnix: number; beforeUnix: number },
  deps: RecheckDeps,
  eventTime: number,
  concurrency = 4,
): Promise<RecheckSummary> {
  const byAthlete = new Map<string, StoredActivity[]>();
  for (const activity of stored) byAthlete.set(activity.athleteId, [...(byAthlete.get(activity.athleteId) ?? []), activity]);
  const summary: RecheckSummary = { changes: [], rejected: [], failures: [], rateLimited: false };
  const queue = [...byAthlete];

  const recheck = async (athlete: Athlete, athleteStored: StoredActivity[]) => {
    try {
      return await recheckAthleteActivities(athlete, athleteStored, window, deps, eventTime);
    } catch (error) {
      if (!(error instanceof TokenRotatedError)) throw error;
      const reread = await deps.getAthlete(athlete.id);
      return reread ? recheckAthleteActivities(reread, athleteStored, window, deps, eventTime) : { changes: [], tokenRejected: false };
    }
  };

  const worker = async () => {
    for (let next = queue.shift(); next && !summary.rateLimited; next = queue.shift()) {
      const [athleteId, athleteStored] = next;
      let name = athleteId;
      try {
        const athlete = await deps.getAthlete(athleteId);
        if (!athlete) continue;
        name = `${athlete.firstname} ${athlete.lastname}`;
        const { changes, tokenRejected } = await recheck(athlete, athleteStored);
        summary.changes.push(...changes);
        if (tokenRejected) summary.rejected.push(name);
      } catch (error) {
        if (hasStatus(error, 429)) summary.rateLimited = true;
        else summary.failures.push(`${name}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  };
  await Promise.all(Array.from({ length: concurrency }, worker));
  return summary;
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
