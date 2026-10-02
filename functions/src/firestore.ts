import { initializeApp, cert } from "firebase-admin/app";
import { CollectionReference, getFirestore } from "firebase-admin/firestore";
import * as path from "path";
import * as fs from "fs";
import { ContestantFitcoin, compareContestantFitcoin, Athlete, StreakState, StoredActivity } from "./challenge-models";
import moment from "moment";
import { TokenFromCodeResponse } from "./strava";
import { shouldSkipStaleWrite } from "./activityLogic";

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

export class Firestore {
  static async getConfig(): Promise<SummerBodiesConfig> {
    const doc = (await configRef.get()).data();
    return doc as SummerBodiesConfig;
  }

  static async updateRefreshToken(stravaRefreshToken: string) {
    await configRef.update({ stravaRefreshToken });
  }

  static async uploadConfig(config: SummerBodiesConfig) {
    // Awaited (not fire-and-forget): examples/manage-strava-webhook.ts's --create flow depends on this write
    // being durable before it triggers Strava's synchronous verification handshake, which reads the just-set
    // stravaWebhookVerifyToken back via getConfig() almost immediately.
    await configRef.set(config);
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

  static async storeFitcoin(fitcoinsContestants: ContestantFitcoin[], date: Date): Promise<void> {
    await this.writeFitcoinDocs(db.collection("fitcoin").doc(date.toDateString()).collection("athletes"), fitcoinsContestants);
  }

  // Uses a `streak-` prefixed doc id (rather than reusing storeFitcoin's date-keyed doc) so a daily streak
  // award never collides with a weekly award that happens to land on the same calendar day.
  static async storeStreakFitcoin(fitcoinsContestants: ContestantFitcoin[], dateString: string): Promise<void> {
    await this.writeFitcoinDocs(db.collection("fitcoin").doc(`streak-${dateString}`).collection("athletes"), fitcoinsContestants);
  }

  // Scoped under the challenge's start date (like fitcoin/<date>/athletes/<name> above) so a new challenge run
  // - a new year's challengeStartDate - starts every athlete fresh, instead of inheriting a prior run's
  // `alive: false` and staying permanently eliminated.
  static async getStreaks(challengeStartDate: string): Promise<Map<string, StreakState>> {
    const docs = await db.collection("streaks").doc(challengeStartDate).collection("athletes").get();
    const streaks = new Map<string, StreakState>();
    docs.forEach((doc) => streaks.set(doc.id, doc.data() as StreakState));
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

  static async getFitcoinTotals(): Promise<ContestantFitcoin[]> {
    const collection = db.collection("fitcoin");
    const docs = await collection.listDocuments();
    let contestants = new Map<string, number>();
    for (const doc of docs) {
      const athletes = await doc.collection("athletes").get();
      athletes.forEach((doc) => {
        const data = doc.data();
        let total = contestants.get(doc.id) || 0;
        total += data.fitcoin;
        contestants.set(doc.id, total);
      });
    }

    let res: ContestantFitcoin[] = [];
    contestants.forEach((fitcoin, name) => {
      const athlete: ContestantFitcoin = {
        name: name,
        fitcoin: fitcoin,
      };
      res.push(athlete);
    });
    return res.sort(compareContestantFitcoin);
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
  // every future Strava fetch for that athlete and, since getAllAthletesActivities treats one athlete's
  // failure as a whole-batch failure, blocks daily/weekly results generation for everyone until the athlete
  // is removed. Does NOT revoke the athlete's Strava-side authorization - callers that want that (e.g.
  // examples/remove-athlete.ts) call Strava.revokeToken separately, since a webhook-driven deauthorization
  // arrives already revoked and only needs local cleanup.
  static async removeAthlete(athleteId: string, challengeStartDate?: string): Promise<void> {
    const batch = db.batch();
    batch.delete(db.collection("athletes").doc(athleteId));
    if (challengeStartDate) {
      batch.delete(db.collection("streaks").doc(challengeStartDate).collection("athletes").doc(athleteId));
    }
    await batch.commit();

    // A separate, chunked step: the activities collection is never pruned by date (only reset-season.ts
    // clears it, between seasons), so an athlete who's been registered a long time could in principle have
    // enough stored activities to exceed Firestore's 500-write batch limit - chunk rather than risk the whole
    // removal failing (including when this is the documented recovery path for an athlete blocking everyone
    // else's results).
    const activityDocs = await db.collection("activities").where("athleteId", "==", athleteId).get();
    const CHUNK_SIZE = 400;
    for (let i = 0; i < activityDocs.docs.length; i += CHUNK_SIZE) {
      const chunk = db.batch();
      activityDocs.docs.slice(i, i + CHUNK_SIZE).forEach((doc) => chunk.delete(doc.ref));
      await chunk.commit();
    }
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

  // Upserts by activity id, guarded by `lastEventTime` so an out-of-order webhook retry (e.g. a delayed
  // retry of an "update" arriving after a newer one already wrote fresher data) can't overwrite newer data
  // with older. Doesn't guard the symmetric case - a very-late "update" retry arriving after a "delete" has
  // already removed the doc - since that's a narrow race that the weekly reconciliation poll (which rewrites
  // the whole window from a fresh Strava fetch every week) self-heals within days; not worth the added
  // complexity of soft-deletes to close it completely.
  // Wrapped in a transaction, not a plain read-then-write: two webhook deliveries for the same activity can
  // arrive close enough together that a non-atomic get()-then-set() would let the staleness check above
  // read stale data, pass, and still let an older write land after a newer one - exactly the race this guard
  // exists to prevent.
  static async upsertActivity(activity: StoredActivity): Promise<void> {
    const ref = db.collection("activities").doc(activity.id.toString());
    await db.runTransaction(async (transaction) => {
      const existing = await transaction.get(ref);
      const existingLastEventTime = existing.exists ? (existing.data() as StoredActivity).lastEventTime : undefined;
      if (shouldSkipStaleWrite(existingLastEventTime, activity.lastEventTime)) return;
      transaction.set(ref, activity);
    });
  }

  // Scoped to the claimed owner: webhook events aren't signed/authenticated (see api.ts's handleWebhookEvent),
  // so without this check, a spoofed owner_id/object_id pair could delete any other athlete's stored
  // activity. A mismatch (or a doc that's already gone) is treated as a no-op, not an error.
  static async deleteActivity(activityId: number, athleteId: string): Promise<void> {
    const ref = db.collection("activities").doc(activityId.toString());
    const doc = await ref.get();
    if (!doc.exists || (doc.data() as StoredActivity).athleteId !== athleteId) return;
    await ref.delete();
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
  // Chosen by us (see examples/manage-strava-webhook.ts), checked against the hub.verify_token Strava sends
  // during the push-subscription validation handshake - see GET /strava-webhook in api.ts.
  stravaWebhookVerifyToken: string;
  // Inclusive UTC calendar dates ("YYYY-MM-DD") bounding the streak challenge.
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
