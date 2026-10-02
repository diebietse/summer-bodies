// Pure logic for the Strava-webhook-fed activity store - deliberately free of any Firestore/Strava network
// imports (unlike activityStore.ts, which uses these) so it can be unit-tested without triggering
// firebase-admin's app initialization as an import side effect.
import { Athlete, AthleteWithActivities, Activity, StoredActivity } from "./challenge-models";
import { StravaWebhookEvent } from "./strava";
import { timingSafeEqual } from "crypto";
import { dateStringUnix } from "./util";

// Converts a Strava activity into its stored shape - shared by the webhook event handler (eventTime = the
// webhook's own event_time) and anything that writes activities outside the webhook pipeline, like the
// weekly reconciliation or a new athlete's registration backfill (eventTime = now()).
// Keeps only the Activity fields the challenge scores on: a webhook's GET /activities/{id} returns the full
// detailed activity (segment efforts, laps, splits, the GPS polyline), which would bloat every stored doc - a
// long ride can approach Firestore's 1 MiB document limit and then fail on every retry - and keep GPS traces we
// have no use for.
export function toStoredActivity(activity: Activity, athleteId: string, eventTime: number): StoredActivity {
  return {
    id: activity.id,
    name: activity.name,
    distance: activity.distance,
    moving_time: activity.moving_time,
    elapsed_time: activity.elapsed_time,
    total_elevation_gain: activity.total_elevation_gain,
    average_speed: activity.average_speed,
    type: activity.type,
    // Firestore rejects undefined fields, and sport_type is optional.
    ...(activity.sport_type !== undefined && { sport_type: activity.sport_type }),
    start_date: activity.start_date,
    start_date_local: activity.start_date_local,
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

// Whether a POSTed body has the shape of a Strava webhook event - checked before anything acts on it, so junk is
// rejected cleanly instead of failing somewhere later.
export function isWebhookEvent(body: unknown): body is StravaWebhookEvent {
  const event = body as Partial<StravaWebhookEvent> | null;
  return (
    typeof event === "object" &&
    event !== null &&
    (event.object_type === "activity" || event.object_type === "athlete") &&
    (event.aspect_type === "create" || event.aspect_type === "update" || event.aspect_type === "delete") &&
    [event.object_id, event.owner_id, event.subscription_id, event.event_time].every((value) => Number.isInteger(value)) &&
    (event.updates === undefined || (typeof event.updates === "object" && event.updates !== null))
  );
}

// Constant-time comparison of a secret from a request against the configured one, so response timing can't be used
// to guess it a character at a time. An unset secret never matches.
export function secretsMatch(given: string | undefined, expected: string | undefined): boolean {
  if (!given || !expected) return false;
  const [a, b] = [Buffer.from(given), Buffer.from(expected)];
  return a.length === b.length && timingSafeEqual(a, b);
}

// True for the specific webhook event Strava sends when an athlete deauthorizes the app - see
// https://developers.strava.com/docs/webhooks/. webhookEvents.ts's processWebhookEvent is the only caller.
export function isDeauthorizationEvent(event: StravaWebhookEvent): boolean {
  return event.object_type === "athlete" && event.aspect_type === "update" && event.updates?.authorized === "false";
}

// True when an incoming write is older than what's already stored, so it can't overwrite newer data - see
// Firestore.upsertActivity, the only caller.
export function shouldSkipStaleWrite(existingLastEventTime: number | undefined, incomingEventTime: number): boolean {
  return existingLastEventTime !== undefined && existingLastEventTime > incomingEventTime;
}

// The stored activities a fresh live poll proves are gone: in the polled window, owned by an athlete whose poll
// succeeded, but not in what Strava returned for them - e.g. deleted or made private while its webhook event was
// missed. Activities of athletes whose poll failed are left alone, since their absence proves nothing.
export function staleStoredActivityIds(storedActivities: StoredActivity[], polledAthletes: AthleteWithActivities[]): number[] {
  const polledIds = new Set(polledAthletes.map((athlete) => athlete.id));
  const liveIds = new Set(polledAthletes.flatMap((athlete) => athlete.activities.map((activity) => activity.id)));
  return storedActivities.filter((stored) => polledIds.has(stored.athleteId) && !liveIds.has(stored.id)).map((stored) => stored.id);
}

// Strava sends no heartbeat, so a dead webhook pipeline would otherwise only show at the next weekly reconciliation.
// Returns what looks wrong: the subscription Strava has isn't the one we configured, or no event has arrived for
// longer than `maxSilenceSeconds` - with dozens of active athletes, a quiet day means events aren't reaching us.
export function webhookLivenessProblems(check: {
  subscriptionIds: number[];
  configuredSubscriptionId: number | undefined;
  lastEventAt: number | undefined;
  now: number;
  maxSilenceSeconds: number;
}): string[] {
  const problems: string[] = [];
  if (check.configuredSubscriptionId === undefined) problems.push("No subscription is configured - run manage-strava-webhook.ts --create");
  else if (!check.subscriptionIds.includes(check.configuredSubscriptionId)) {
    problems.push(
      `Strava has ${check.subscriptionIds.length ? `subscription ${check.subscriptionIds.join(", ")}` : "no subscription"}, not the configured ${check.configuredSubscriptionId} - run manage-strava-webhook.ts --create`,
    );
  }
  if (check.lastEventAt === undefined) problems.push("No webhook event has ever arrived");
  else if (check.now - check.lastEventAt > check.maxSilenceSeconds) {
    problems.push(`No webhook event for ${Math.floor((check.now - check.lastEventAt) / 3600)} hours`);
  }
  return problems;
}

// The webhook config fields the routes in api.ts check requests against - see SummerBodiesConfig.
export interface WebhookRouteConfig {
  stravaWebhookPathSecret?: string;
  stravaWebhookVerifyToken?: string;
  stravaWebhookSubscriptionId?: number;
}

// What GET /strava-webhook/:secret answers: Strava's subscription handshake echoes hub.challenge for the right verify
// token. The secret path comes first, so a wrong one looks like no endpoint at all.
export function webhookVerificationResponse(
  secret: string,
  query: Record<string, unknown>,
  config: WebhookRouteConfig,
): { status: number; body: object } {
  if (!secretsMatch(secret, config.stravaWebhookPathSecret)) return { status: 404, body: { error: "Not found" } };
  const verified = query["hub.mode"] === "subscribe" && secretsMatch(String(query["hub.verify_token"] ?? ""), config.stravaWebhookVerifyToken);
  return verified
    ? { status: 200, body: { "hub.challenge": query["hub.challenge"] } }
    : { status: 403, body: { error: "Verification token mismatch" } };
}

// What POST /strava-webhook/:secret does with a request: `queue` is the event to queue, if any. An event for another
// subscription is acknowledged (a 200) but dropped, so Strava doesn't keep retrying one we no longer use.
export function webhookPostResponse(
  secret: string,
  body: unknown,
  config: WebhookRouteConfig,
): { status: number; body: object; queue?: StravaWebhookEvent; warning?: string } {
  if (!secretsMatch(secret, config.stravaWebhookPathSecret)) return { status: 404, body: { error: "Not found" } };
  if (!isWebhookEvent(body))
    return {
      status: 400,
      body: { error: "Not a Strava webhook event" },
      warning: `Ignoring a malformed Strava webhook event: ${JSON.stringify(body)}`,
    };
  if (config.stravaWebhookSubscriptionId !== undefined && body.subscription_id !== config.stravaWebhookSubscriptionId) {
    return { status: 200, body: {}, warning: `Ignoring a Strava webhook event for subscription ${body.subscription_id}` };
  }
  return { status: 200, body: {}, queue: body };
}

// Whether the daily webhook liveness check runs at `now`: from the challenge's first day through the day after its
// last (SAST), while its last activities still come in. Outside that, few events is normal.
export function isLivenessCheckTime(now: number, challengeStartDate: string, challengeEndDate: string): boolean {
  return now >= dateStringUnix(challengeStartDate) && now < dateStringUnix(challengeEndDate) + 2 * 24 * 60 * 60;
}

// Polled activities that weren't in the store - each a create event the webhooks missed.
export function missedStoredActivities(
  storedActivities: StoredActivity[],
  polledAthletes: AthleteWithActivities[],
): { athleteName: string; activityId: number; startDate: string }[] {
  const storedIds = new Set(storedActivities.map((activity) => activity.id));
  return polledAthletes.flatMap((athlete) =>
    athlete.activities
      .filter((activity) => !storedIds.has(activity.id))
      .map((activity) => ({ athleteName: `${athlete.firstname} ${athlete.lastname}`, activityId: activity.id, startDate: activity.start_date })),
  );
}
