import { initializeApp, cert } from "firebase-admin/app";
import { CollectionReference, DocumentReference, FieldValue, getFirestore } from "firebase-admin/firestore";
import * as path from "path";
import * as fs from "fs";
import { ContestantFitcoin, compareContestantFitcoin, Athlete, StreakState, StoredActivity } from "./challenge-models";
import moment from "moment";
import { StravaWebhookEvent, TokenFromCodeResponse } from "./strava";
import { lastDayOfPreviousWeek, now } from "./util";
import { shouldSkipStaleWrite } from "./activityLogic";
import { FitcoinAward, isChallengeAward, isDatedAward } from "./draw";
import { Challenge } from "./challenge";
import { QueuedWebhookEvent } from "./webhookEvents";

// service-account.json in the root directory of the project
const CUSTOM_SERVICE_ACCOUNT = path.resolve(__dirname, "../../service-account.json");

if (fs.existsSync(CUSTOM_SERVICE_ACCOUNT)) {
  // If custom service account exists in expected place, use it. storageBucket has to be set explicitly here -
  // unlike the deployed-on-GCP case below, there's no ambient project config to infer it from. `<project-id>.appspot.com`
  // is right for projects created before Google's Oct 2024 default-bucket change; a project created after that
  // defaults to `<project-id>.firebasestorage.app` instead - set FIREBASE_STORAGE_BUCKET to override if so.
  console.log(`Using custom service account: ${CUSTOM_SERVICE_ACCOUNT}`);
  const { project_id } = JSON.parse(fs.readFileSync(CUSTOM_SERVICE_ACCOUNT, "utf8"));
  const storageBucket = process.env.FIREBASE_STORAGE_BUCKET || `${project_id}.appspot.com`;
  initializeApp({ credential: cert(CUSTOM_SERVICE_ACCOUNT), storageBucket });
} else {
  // If no custom service account exists this is deployed on GCP and googles sets it for us
  initializeApp();
}

const db = getFirestore();
const configRef = db.collection("config").doc("config");
// Kept in its own collection (rather than alongside configRef) so it's trivially safe to expose publicly -
// nothing in here is ever a secret, unlike SummerBodiesConfig.
const brandingRef = db.collection("branding").doc("branding");
const webhookStatusRef = db.collection("status").doc("stravaWebhook");

export class Firestore {
  static async getConfig(): Promise<SummerBodiesConfig> {
    const doc = (await configRef.get()).data();
    return doc as SummerBodiesConfig;
  }

  // Updates only the given fields, unlike uploadConfig.
  static async updateConfig(fields: Partial<SummerBodiesConfig>): Promise<void> {
    await configRef.update(fields);
  }

  static async updateRefreshToken(stravaRefreshToken: string) {
    await configRef.update({ stravaRefreshToken });
  }

  // Merged into the stored config rather than replacing it, so uploading example-config.json keeps the fields it
  // doesn't list - above all the Strava webhook's (set by manage-strava-webhook.ts), without which every webhook event
  // would be turned away. To remove a field, delete it in the Firestore console.
  static async uploadConfig(config: SummerBodiesConfig) {
    await configRef.set(config, { merge: true });
  }

  static async getBranding(): Promise<Branding | null> {
    const doc = (await brandingRef.get()).data();
    return (doc as Branding) ?? null;
  }

  static async uploadBranding(branding: Branding): Promise<void> {
    await brandingRef.set(branding);
  }

  private static async writeFitcoinDocs(collection: CollectionReference, contestants: ContestantFitcoin[]): Promise<void> {
    const batch = db.batch();
    contestants.forEach((contestant) => batch.set(collection.doc(contestant.name), { fitcoin: contestant.fitcoin }));
    await batch.commit();
  }

  // A one-off correction can be stored the same way under a name with the challenge's start date in it, e.g.
  // "tie-fix-2027-10-04" - see draw.ts's isChallengeAward for which awards count towards a challenge.
  static async storeFitcoin(fitcoinsContestants: ContestantFitcoin[], weekLabel: string): Promise<void> {
    await this.writeFitcoinDocs(db.collection("fitcoin").doc(weekLabel).collection("athletes"), fitcoinsContestants);
  }

  // The streak challenge's one award, made at the end of the challenge (see Bot.finalizeStreaks), keyed by the
  // challenge's start date so it never collides with a weekly award.
  static async storeStreakFitcoin(fitcoinsContestants: ContestantFitcoin[], challengeStartDate: string): Promise<void> {
    await this.writeFitcoinDocs(db.collection("fitcoin").doc(`streak-${challengeStartDate}`).collection("athletes"), fitcoinsContestants);
  }

  // Scoped under the challenge's start date so a new challenge run - a new year's challengeStartDate - starts every
  // athlete fresh, instead of inheriting a prior run's streaks.
  static async getStreaks(challengeStartDate: string): Promise<Map<string, StreakState>> {
    const docs = await db.collection("streaks").doc(challengeStartDate).collection("athletes").get();
    const streaks = new Map<string, StreakState>();
    docs.forEach((doc) => {
      streaks.set(doc.id, Challenge.withStreakDefaults(doc.data() as StreakState, lastDayOfPreviousWeek(moment(doc.updateTime.toMillis()))));
    });
    return streaks;
  }

  static async saveStreaks(challengeStartDate: string, streaks: StreakState[]): Promise<void> {
    const collection = db.collection("streaks").doc(challengeStartDate).collection("athletes");
    const batch = db.batch();
    streaks.forEach((streak) => {
      // A non-string/empty athleteId here fails Firestore's .doc() with a generic "documentPath must be a
      // non-empty string" error that doesn't say which athlete or what the bad value was - check explicitly
      // so a bad athleteId is obvious immediately instead of requiring a debugging session.
      if (typeof streak.athleteId !== "string" || streak.athleteId.length === 0) {
        throw new Error(
          `saveStreaks: invalid athleteId for "${streak.name}": ${JSON.stringify(streak.athleteId)} (typeof ${typeof streak.athleteId}), expected a non-empty string`,
        );
      }
      batch.set(collection.doc(streak.athleteId), streak);
    });
    await batch.commit();
  }

  // Every FitCoin award of the challenge from `challenge.startDate` to `endDate`, one per person per award doc (a
  // week's results, the streak challenge) - see draw.ts's isChallengeAward for which docs count. The lucky draw's
  // tickets are worked out from these (see draw.ts).
  static async getFitcoinAwards(challenge: { startDate: string; endDate: string }): Promise<FitcoinAward[]> {
    const awards: FitcoinAward[] = [];
    for (const doc of await db.collection("fitcoin").listDocuments()) {
      if (!isDatedAward(doc.id)) console.warn(`FitCoin award "${doc.id}" names no week or date, so it never counts - see draw.ts's isChallengeAward`);
      if (!isChallengeAward(doc.id, challenge)) continue;
      const athletes = await doc.collection("athletes").get();
      athletes.forEach((athlete) => awards.push({ name: athlete.id, award: doc.id, fitcoin: athlete.data().fitcoin }));
    }
    return awards;
  }

  // Everyone's FitCoin total for the challenge from `challenge.startDate` to `endDate` - see getFitcoinAwards.
  static async getFitcoinTotals(challenge: { startDate: string; endDate: string }): Promise<ContestantFitcoin[]> {
    const totals = new Map<string, number>();
    for (const { name, fitcoin } of await this.getFitcoinAwards(challenge)) totals.set(name, (totals.get(name) ?? 0) + fitcoin);
    return [...totals].map(([name, fitcoin]) => ({ name, fitcoin })).sort(compareContestantFitcoin);
  }

  static async storeBackup(dataSnapshot: string) {
    const doc = db.collection("backups").doc(moment.utc().toISOString());
    await doc.create({ dataSnapshot });
  }

  static async getRegisteredAthletes(): Promise<Athlete[]> {
    const collection = db.collection("athletes");
    const athletes = await collection.get();
    let res: Athlete[] = [];
    athletes.forEach((doc) => {
      const data = doc.data() as Athlete;
      // `id` is coerced to a string defensively: some existing documents may have it stored as a raw number,
      // and code downstream relies on Athlete.id being a string - e.g. to look it up as a Map key or pass it
      // to Firestore's .doc(), both of which silently fail or throw for a number.
      res.push({ ...data, id: String(data.id) });
    });

    return res;
  }

  static async athleteIsRegistered(athleteId: number): Promise<Boolean> {
    const athlete = db.collection("athletes").doc(athleteId.toString());
    return await athlete.get().then((data) => {
      return data.exists;
    });
  }

  // Single-athlete lookup (vs. getRegisteredAthletes reading the whole collection) - used by the webhook
  // event handler, which needs to check/fetch one specific athlete per event, not everyone.
  static async getAthlete(athleteId: string): Promise<Athlete | null> {
    const doc = await db.collection("athletes").doc(athleteId).get();
    if (!doc.exists) return null;
    const data = doc.data() as Athlete;
    return { ...data, id: String(data.id) };
  }

  static async storeAthlete(data: TokenFromCodeResponse) {
    const doc = db.collection("athletes").doc(data.athlete.id.toString());
    const athlete = {
      id: data.athlete.id.toString(),
      firstname: data.athlete.firstname,
      lastname: data.athlete.lastname,
      profile: data.athlete.profile,
      refreshToken: data.refresh_token,
    };
    await doc.create({ ...athlete });
  }

  static async updateAthletesRefreshToken(athletes: Athlete[]) {
    await Promise.all(athletes.map((athlete) => db.collection("athletes").doc(athlete.id.toString()).update({ refreshToken: athlete.refreshToken })));
  }

  // Deletes an athlete's registration (profile + refresh token), their stored activities, and, if given,
  // their doc in the current challenge's streak collection - see functions/examples/remove-athlete.ts. Used
  // to honor a deauthorization or data-deletion request (see the Strava API Agreement's termination clause on
  // deleting Strava Data), and doubles as the fix for a revoked/invalid refresh token, which otherwise fails
  // every future Strava fetch for that athlete - the weekly results are all-or-nothing and stay blocked for
  // everyone until the athlete is removed. Does NOT revoke the athlete's Strava-side authorization - callers
  // that want that (e.g. examples/remove-athlete.ts) call Strava.revokeToken separately, since a
  // webhook-driven deauthorization arrives already revoked and only needs local cleanup.
  static async removeAthlete(athleteId: string, challengeStartDate?: string): Promise<void> {
    // Activities first and the athlete doc last: remove-athlete.ts and reset-season.ts find athletes through
    // their athlete doc, so if this fails part-way, re-running them must still be able to find the athlete and
    // finish - deleting the athlete doc first would orphan their activities for good. Chunked, since the
    // activities collection is never pruned by date (only reset-season.ts clears it, between seasons).
    const activityDocs = await db.collection("activities").where("athleteId", "==", athleteId).get();
    await this.deleteInChunks(activityDocs.docs.map((doc) => doc.ref));

    const batch = db.batch();
    batch.delete(db.collection("athletes").doc(athleteId));
    if (challengeStartDate) {
      batch.delete(db.collection("streaks").doc(challengeStartDate).collection("athletes").doc(athleteId));
    }
    await batch.commit();
  }

  // Everything below supports the Strava-webhook-fed activity store (see activityStore.ts), which replaces
  // the daily poll of every athlete's Strava activities - see Bot.publishDailyUpdates. A flat top-level
  // collection (not a subcollection per athlete): Strava activity ids are globally unique, and
  // Challenge.calculateResults needs every registered athlete's activities in one date range on every run -
  // a single flat range query beats N per-athlete subcollection queries for that.
  static async getActivitiesInRange(startUnixTime: number, endUnixTime: number): Promise<StoredActivity[]> {
    const docs = await db.collection("activities").where("startDateUnix", ">=", startUnixTime).where("startDateUnix", "<", endUnixTime).get();
    return docs.docs.map((doc) => doc.data() as StoredActivity);
  }

  // Upserts by activity id, guarded by `lastEventTime` so an older write can't overwrite a newer one - between
  // concurrent writers (a webhook event against the weekly reconciliation or a registration backfill). Webhook events
  // always store what Strava returns when they're processed, not the event's own data, so a late retry can't bring
  // back stale data, and one for a deleted activity deletes it again (see webhookEvents.ts). In a transaction, so two
  // writers can't both pass the check and let the older write land last.
  static async upsertActivity(activity: StoredActivity): Promise<void> {
    const ref = db.collection("activities").doc(activity.id.toString());
    await db.runTransaction(async (transaction) => {
      const existing = await transaction.get(ref);
      const existingLastEventTime = existing.exists ? (existing.data() as StoredActivity).lastEventTime : undefined;
      if (shouldSkipStaleWrite(existingLastEventTime, activity.lastEventTime)) return;
      transaction.set(ref, activity);
    });
  }

  // Scoped to the claimed owner: webhook events aren't signed/authenticated (see webhookEvents.ts),
  // so without this check, a spoofed owner_id/object_id pair could delete any other athlete's stored
  // activity. A mismatch (or a doc that's already gone) is treated as a no-op, not an error.
  static async deleteActivity(activityId: number, athleteId: string): Promise<void> {
    const ref = db.collection("activities").doc(activityId.toString());
    const doc = await ref.get();
    if (!doc.exists || (doc.data() as StoredActivity).athleteId !== athleteId) return;
    await ref.delete();
  }

  // Unscoped (unlike deleteActivity above): only for ids a fresh live poll proved are gone - see
  // activityStore.syncActivitiesIntoStore.
  static async deleteActivities(activityIds: number[]): Promise<void> {
    await this.deleteInChunks(activityIds.map((id) => db.collection("activities").doc(id.toString())));
  }

  // Firestore batches take at most 500 writes.
  private static async deleteInChunks(refs: DocumentReference[]): Promise<void> {
    const CHUNK_SIZE = 400;
    for (let i = 0; i < refs.length; i += CHUNK_SIZE) {
      const chunk = db.batch();
      refs.slice(i, i + CHUNK_SIZE).forEach((ref) => chunk.delete(ref));
      await chunk.commit();
    }
  }

  // Strava webhook events wait here, acknowledged, until processStravaWebhookEvent (index.ts) handles them - Strava
  // wants a 200 within 2 seconds, which checking an event with Strava can't promise.
  // Also records when the last event arrived, for checkWebhookLiveness (activityStore.ts).
  static async queueWebhookEvent(event: StravaWebhookEvent): Promise<void> {
    const receivedAt = now();
    const batch = db.batch();
    batch.create(db.collection("webhookEvents").doc(), { event, receivedAt, attempts: 0 });
    batch.set(webhookStatusRef, { lastEventAt: receivedAt }, { merge: true });
    await batch.commit();
  }

  static async getLastWebhookEventAt(): Promise<number | undefined> {
    return (await webhookStatusRef.get()).data()?.lastEventAt;
  }

  static async getQueuedWebhookEvent(id: string): Promise<QueuedWebhookEvent | null> {
    return ((await db.collection("webhookEvents").doc(id).get()).data() as QueuedWebhookEvent | undefined) ?? null;
  }

  static async getWebhookEventsReceivedBefore(unixTime: number): Promise<{ id: string; queued: QueuedWebhookEvent }[]> {
    const docs = await db.collection("webhookEvents").where("receivedAt", "<", unixTime).get();
    return docs.docs.map((doc) => ({ id: doc.id, queued: doc.data() as QueuedWebhookEvent }));
  }

  static async countWebhookEventAttempt(id: string): Promise<void> {
    await db
      .collection("webhookEvents")
      .doc(id)
      .update({ attempts: FieldValue.increment(1) });
  }

  static async deleteWebhookEvent(id: string): Promise<void> {
    await db.collection("webhookEvents").doc(id).delete();
  }

  static async storeResults(id: string, results: string): Promise<void> {
    await db.collection("results").doc(id).set({ result: results });
  }

  static async getResults(id: string): Promise<string | null> {
    const doc = await db.collection("results").doc(id).get();
    if (doc.exists) {
      const data = doc.data();
      return data?.result || null;
    }
    return null;
  }

  // The lucky draw snapshot (see draw.ts), stored as the exact JSON text whose SHA-256 fingerprint gets announced.
  // Keyed by challenge start date so create() fails if one already exists - once the fingerprint is out, the snapshot
  // must never change - and readable only by its random `id`, the secret in the /draw/<id> link.
  static async createDrawSnapshot(challengeStartDate: string, id: string, snapshot: string): Promise<void> {
    await db.collection("draws").doc(challengeStartDate).create({ id, snapshot });
  }

  static async getDrawSnapshot(id: string): Promise<string | null> {
    const docs = await db.collection("draws").where("id", "==", id).limit(1).get();
    return docs.empty ? null : (docs.docs[0].data().snapshot ?? null);
  }

  // Whether the weekly results for the week labelled `weekLabel` (see util.weekLabel) have stored any FitCoin.
  static async hasWeeklyFitcoin(weekLabel: string): Promise<boolean> {
    const athletes = await db.collection("fitcoin").doc(weekLabel).collection("athletes").limit(1).get();
    return !athletes.empty;
  }
}

export interface SummerBodiesConfig {
  slackWebhookUrl: string;
  slackChannelDaily: string;
  slackChannelWeekly: string;
  // Where unexpected backend errors get reported - see errorReporting.ts. Optional so existing deployments
  // without it don't break; error reporting is just skipped if unset.
  slackChannelErrors?: string;
  stravaBotId: string;
  stravaClientId: string;
  stravaRefreshToken: string;
  stravaClientSecret: string;
  // All three set by examples/manage-strava-webhook.ts --create - see the webhook routes in api.ts.
  // Checked against the hub.verify_token Strava sends during the push-subscription validation handshake.
  stravaWebhookVerifyToken?: string;
  // The secret last segment of the callback URL (/strava-webhook/<secret>). Strava doesn't sign events, so this is
  // what keeps out anyone who doesn't know the URL.
  stravaWebhookPathSecret?: string;
  // Events for any other subscription are ignored.
  stravaWebhookSubscriptionId?: number;
  // Inclusive SAST calendar dates ("YYYY-MM-DD") bounding the streak challenge.
  challengeStartDate: string;
  challengeEndDate: string;
}

// Public-safe (no secrets) white-labeling for the website - see api.ts's GET /branding and
// functions/examples/upload-branding.ts.
export interface Branding {
  appName: string;
  logoUrl: string;
  faviconUrl?: string;
}
